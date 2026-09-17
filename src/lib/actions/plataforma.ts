"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  fn: "platform_mark_paid" | "platform_unmark_paid" | "platform_set_price",
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

export async function cambiarPrecio(
  tenantId: string,
  precioCents: number,
): Promise<PlataformaState> {
  return llamar(
    "platform_set_price",
    { p_tenant: tenantId, p_price_cents: precioCents },
    "Precio actualizado.",
  );
}
