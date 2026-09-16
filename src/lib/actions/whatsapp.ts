"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Conectar y desconectar WhatsApp.
 *
 * Nada de esto escribe en la tabla directamente: pasa por funciones de la base
 * que comprueban el rol por su cuenta, porque `whatsapp_accounts` no tiene
 * ningún permiso para quien navega. El token viaja hacia adentro y no vuelve
 * nunca.
 */

export type ConexionState = {
  error: string | null;
  notice?: string | null;
  values?: Record<string, string>;
};

const schema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(5, "Copiá el identificador del número, tal como aparece en Meta."),
  accessToken: z
    .string()
    .trim()
    .min(20, "El token es más largo que eso. Copialo entero."),
  wabaId: z.string().trim().optional(),
  displayPhone: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
  verifyToken: z.string().trim().optional(),
});

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [clave, valor] of formData.entries()) {
    // El token y el secreto no se devuelven a la pantalla: si el formulario
    // falla por otro campo, se vuelven a pegar.
    if (clave === "accessToken" || clave === "appSecret") continue;
    if (typeof valor === "string") out[clave] = valor;
  }
  return out;
}

export async function conectarWhatsapp(
  _prev: ConexionState,
  formData: FormData,
): Promise<ConexionState> {
  const parsed = schema.safeParse({
    phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
    accessToken: String(formData.get("accessToken") ?? ""),
    wabaId: String(formData.get("wabaId") ?? ""),
    displayPhone: String(formData.get("displayPhone") ?? ""),
    appSecret: String(formData.get("appSecret") ?? ""),
    verifyToken: String(formData.get("verifyToken") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("whatsapp_connect", {
    p_phone_number_id: parsed.data.phoneNumberId,
    p_access_token: parsed.data.accessToken,
    p_waba_id: parsed.data.wabaId || undefined,
    p_display_phone: parsed.data.displayPhone || undefined,
    p_app_secret: parsed.data.appSecret || undefined,
    p_verify_token: parsed.data.verifyToken || undefined,
    p_onboarding: "manual",
  });

  if (error) {
    return { error: "No se pudo guardar la conexión.", values: echo(formData) };
  }

  const r = data as unknown as { ok: boolean; error?: string };
  if (!r?.ok) {
    return { error: r?.error ?? "No se pudo guardar.", values: echo(formData) };
  }

  revalidatePath("/configuracion/whatsapp");
  return { error: null, notice: "Guardado." };
}

export async function desconectarWhatsapp(): Promise<ConexionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("whatsapp_disconnect");

  if (error) return { error: "No se pudo desconectar." };

  const r = data as unknown as { ok: boolean; error?: string };
  if (!r?.ok) return { error: r?.error ?? "No se pudo desconectar." };

  revalidatePath("/configuracion/whatsapp");
  return { error: null };
}

export type Paso = {
  clave: string;
  titulo: string;
  ok: boolean;
  detalle: string;
};

export type RevisionState = {
  error: string | null;
  pasos?: Paso[];
  values?: Record<string, string>;
};

/**
 * Le pregunta a Meta si la conexión quedó bien.
 *
 * Los cinco pasos de Meta terminan sin que nadie te diga si funcionaron. Esto
 * revisa las tres cosas que se rompen —el token, el nombre de las plantillas y
 * el envío— y traduce lo que Meta contesta, que viene en códigos que no le
 * dicen nada a quien no es técnico.
 *
 * Corre en el emisor y no acá: el token no sale nunca de Supabase, y de paso
 * se prueba el mismo camino de red por el que salen los mensajes de verdad.
 */
export async function revisarWhatsapp(
  _prev: RevisionState,
  formData: FormData,
): Promise<RevisionState> {
  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };
  if (!atLeast(membership.role, "admin")) {
    return { error: "Sólo la dueña o administración pueden revisar esto." };
  }

  const destino = String(formData.get("destino") ?? "").trim();
  const env = serverEnv();

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Falta configurar el servidor para poder revisar." };
  }

  try {
    const r = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-check`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          tenantId: membership.tenantId,
          destino: destino || undefined,
        }),
      },
    );

    const datos = (await r.json()) as { pasos?: Paso[]; error?: string };

    if (!r.ok || datos.error) {
      return {
        error: datos.error ?? "No se pudo completar la revisión.",
        values: { destino },
      };
    }

    return { error: null, pasos: datos.pasos ?? [], values: { destino } };
  } catch {
    return {
      error: "No se pudo hablar con el servidor de envíos.",
      values: { destino },
    };
  }
}
