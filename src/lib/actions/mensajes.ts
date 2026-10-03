"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { atLeast, getCurrentTenant, getCurrentUser } from "@/lib/auth/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null; notice?: string | null };

const GRAPH = "https://graph.facebook.com/v23.0";

const schema = z.object({
  telefono: z.string().trim().min(6),
  texto: z
    .string()
    .trim()
    .min(1, "Escribí algo antes de enviar.")
    .max(4096, "El mensaje es demasiado largo."),
});

/**
 * Contesta por WhatsApp desde la bandeja.
 *
 * Tres cosas pasan acá y ninguna puede saltearse:
 *
 *   1. SE COMPRUEBA LA VENTANA ANTES DE GASTAR UN VIAJE. Meta sólo acepta
 *      texto libre dentro de las 24 horas posteriores al último mensaje de la
 *      clienta; fuera de eso responde 131047. Preguntar primero deja decirlo
 *      en castellano en vez de mostrar un código.
 *   2. EL TOKEN NO PASA POR EL NAVEGADOR. Vive en whatsapp_accounts, que
 *      `authenticated` no puede leer. Por eso el envío ocurre en el servidor y
 *      el cliente con `service_role` se usa sólo para buscar esa credencial,
 *      después de haber confirmado a mano que quien pide es de la estética.
 *   3. QUEDA ANOTADO SALGA O NO SALGA. Si Meta lo rechaza, el error se guarda
 *      con el mensaje: que un envío falle en silencio es peor que no tener
 *      bandeja, porque quien lo escribió se queda creyendo que contestó.
 */
export async function responder(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({
    telefono: String(formData.get("telefono") ?? ""),
    texto: String(formData.get("texto") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá el mensaje." };
  }

  const { telefono, texto } = parsed.data;

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };
  if (!atLeast(membership.role, "staff")) {
    return { error: "No tenés permiso para contestar mensajes." };
  }

  const tenantId = membership.tenant.id;

  // La ventana se consulta con la sesión de quien pide: si el teléfono no es
  // de su estética, la RLS no devuelve nada y no hay ventana que abrir.
  const supabase = await createClient();
  const { data: ventana } = await supabase
    .rpc("whatsapp_conversaciones", { p_tenant: tenantId })
    .eq("telefono", telefono.replace(/\D/g, ""))
    .maybeSingle();

  if (!ventana) {
    return { error: "Esa conversación no es de tu negocio." };
  }

  const hasta = ventana.ventana_hasta ? new Date(ventana.ventana_hasta) : null;
  if (!hasta || hasta.getTime() <= Date.now()) {
    return {
      error:
        "Pasaron más de 24 horas desde su último mensaje, así que WhatsApp ya " +
        "no deja escribirle texto libre. Vas a poder contestarle cuando " +
        "vuelva a escribir.",
    };
  }

  const admin = createAdminClient();
  const { data: credenciales } = await admin.rpc("rpc_whatsapp_credentials", {
    p_tenant: tenantId,
  });

  const cuenta = credenciales as {
    phone_number_id?: string;
    access_token?: string;
  } | null;

  if (!cuenta?.phone_number_id || !cuenta.access_token) {
    return { error: "Todavía no hay un WhatsApp conectado en este negocio." };
  }

  const usuario = await getCurrentUser();

  let waId: string | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(`${GRAPH}/${cuenta.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cuenta.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "text",
        text: { body: texto, preview_url: true },
      }),
    });

    const cuerpo = await res.json().catch(() => null);
    waId = cuerpo?.messages?.[0]?.id ?? null;
    if (!res.ok) error = cuerpo?.error?.message ?? `HTTP ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo enviar.";
  }

  await admin.rpc("rpc_record_outbound", {
    p_tenant: tenantId,
    p_to_phone: telefono,
    p_body: texto,
    p_wa_message_id: waId ?? undefined,
    p_sent_by: usuario?.id ?? undefined,
    p_error: error ?? undefined,
  });

  revalidatePath("/mensajes");
  revalidatePath(`/mensajes/${telefono.replace(/\D/g, "")}`);

  if (error) {
    return { error: `WhatsApp no lo aceptó: ${error}` };
  }
  return { error: null, notice: "Enviado." };
}

/**
 * Deja constancia de que esta persona ya vio esta conversación.
 *
 * Se llama al abrirla. No devuelve nada ni corta si falla: que el contador
 * quede en un número de más es molesto, perder el mensaje no.
 */
export async function marcarVisto(telefono: string): Promise<void> {
  const membership = await getCurrentTenant();
  if (!membership) return;

  const supabase = await createClient();
  await supabase.rpc("whatsapp_marcar_visto", {
    p_tenant: membership.tenant.id,
    p_telefono: telefono,
  });

  // La barra vive en el marco, así que el contador se refresca desde la raíz.
  revalidatePath("/", "layout");
}
