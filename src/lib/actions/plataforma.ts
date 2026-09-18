"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

/**
 * El panel de Dlay.
 *
 * Ninguna de estas acciones comprueba permisos acá: las tres llaman a
 * funciones de la base que lo hacen por su cuenta contra `platform_admins`.
 * Comprobarlo en dos lugares es garantizar que algún día digan cosas
 * distintas.
 */

export type PlataformaState = { error: string | null; notice?: string | null };

type Respuesta = { ok: boolean; error?: string };

async function llamar(
  fn: | "platform_mark_paid"
  | "platform_unmark_paid"
  | "platform_set_billing"
  | "platform_set_month_amount"
  | "platform_nudge",
  args: Record<string, unknown>,
  exito: string,
): Promise<PlataformaState> {
  const supabase = await createClient();
  // @ts-expect-error El nombre de la función es dinámico y los tipos generados
  // exigen un literal. Los tres argumentos están comprobados del lado de la base.
  const { data, error } = await supabase.rpc(fn, args);

  if (error) {
    // El 42501 es la puerta cerrada de la propia base.
    return {
      error:
        error.code === "42501"
          ? "Esto es del panel de Dlay."
          : "No se pudo completar la operación.",
    };
  }

  const r = data as unknown as Respuesta;
  if (!r?.ok) return { error: r?.error ?? "No se pudo completar la operación." };

  revalidatePath("/plataforma");
  return { error: null, notice: exito };
}

export async function marcarPagado(
  tenantId: string,
  periodo: string,
): Promise<PlataformaState> {
  return llamar(
    "platform_mark_paid",
    { p_tenant: tenantId, p_period: periodo },
    "Mes marcado como pagado.",
  );
}

export async function deshacerPago(
  tenantId: string,
  periodo: string,
): Promise<PlataformaState> {
  return llamar(
    "platform_unmark_paid",
    { p_tenant: tenantId, p_period: periodo },
    "El pago quedó sin marcar.",
  );
}

/**
 * Cambia cómo se le cobra a un negocio.
 *
 * Se mandan los dos valores siempre, no sólo el de la forma elegida: así,
 * quien vuelve del fijo al porcentaje encuentra el porcentaje que tenía y no
 * un cero.
 */
export async function cambiarCobro(
  tenantId: string,
  modo: "percent" | "fixed",
  bps: number,
  fijoCents: number,
): Promise<PlataformaState> {
  return llamar(
    "platform_set_billing",
    {
      p_tenant: tenantId,
      p_mode: modo,
      p_bps: bps,
      p_fixed_cents: fijoCents,
    },
    modo === "fixed" ? "Pasó a abono fijo." : "Pasó a porcentaje.",
  );
}

/**
 * Pone a mano el importe de un mes, o lo borra para volver a lo pactado.
 *
 * Es para apartarse de lo acordado sin cambiar el acuerdo: un mes flojo que se
 * perdona, un arreglo puntual.
 */
export async function cambiarImporteMes(
  tenantId: string,
  periodo: string,
  cents: number | null,
): Promise<PlataformaState> {
  return llamar(
    "platform_set_month_amount",
    { p_tenant: tenantId, p_period: periodo, p_amount_cents: cents },
    cents === null ? "Volvió a lo pactado." : "Importe actualizado.",
  );
}

/**
 * Le recuerda a un negocio que tiene un mes sin pagar.
 *
 * Levanta un cartel en su sistema y, si tiene las notificaciones activadas,
 * le manda además una al teléfono. Se puede apretar más de una vez.
 */
export async function recordarCuenta(
  tenantId: string,
  periodo: string,
): Promise<PlataformaState> {
  return llamar(
    "platform_nudge",
    { p_tenant: tenantId, p_period: periodo },
    "Recordatorio enviado.",
  );
}

export type EnlaceClave = {
  error: string | null;
  url?: string;
  correo?: string;
};

/**
 * Un enlace de un solo uso para que un negocio ponga una contraseña nueva.
 *
 * La contraseña no se puede mostrar y no es un capricho: lo que guarda
 * Supabase es un hash de una vía, el texto original no existe en ningún lado.
 * Guardar una copia legible para poder dictarla sería construir a propósito el
 * agujero: si este panel se filtra, se filtran las contraseñas de todos los
 * negocios, y como la gente repite contraseña, con eso se les entra a otras
 * cosas.
 *
 * Esto resuelve lo mismo sin ese precio: se genera el enlace, se copia y se
 * manda por donde sea. Quien lo recibe elige su contraseña y Dlay nunca la ve.
 */
export async function generarEnlaceClave(
  tenantId: string,
): Promise<EnlaceClave> {
  const supabase = await createClient();

  // La puerta es la de siempre: si quien pregunta no es de la plataforma, la
  // base lo rechaza y no se genera nada.
  const { error: puerta } = await supabase.rpc("platform_accounts");
  if (puerta) return { error: "Esto es del panel de Dlay." };

  const admin = createAdminClient();

  const { data: duenio, error: errorDuenio } = await admin.rpc(
    "rpc_tenant_owner",
    { p_tenant: tenantId },
  );

  if (errorDuenio) return { error: "No se pudo buscar al titular." };

  const titular = duenio as unknown as { correo?: string } | null;
  if (!titular?.correo) {
    return { error: "Ese negocio no tiene a nadie con cuenta." };
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: titular.correo,
  });

  if (error || !data?.properties?.hashed_token) {
    return { error: "No se pudo generar el enlace." };
  }

  const url = new URL("/auth/confirmar", publicEnv.NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "recovery");

  return { error: null, url: url.toString(), correo: titular.correo };
}
