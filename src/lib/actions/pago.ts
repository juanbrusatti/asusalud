"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { formatMes } from "@/lib/cuenta";
import { getCuenta } from "@/lib/data/cuenta";
import { publicEnv, serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * El cobro de un mes, por Mercado Pago.
 *
 * El importe no llega desde la pantalla: se vuelve a calcular acá. Un número
 * que viaja por el navegador es un número que se puede editar, y este es el
 * que termina en un cobro.
 *
 * La preferencia se crea una sola vez por mes. Mercado Pago genera una nueva
 * en cada llamada, así que un botón que la pide de nuevo en cada visita deja
 * la cuenta llena de cobros que nadie va a poder conciliar.
 */

export type PagoState = {
  error: string | null;
  periodo?: string;
  url?: string;
  /** El QR como imagen lista para poner en un `img`. */
  qr?: string;
};

async function conQr(periodo: string, url: string): Promise<PagoState> {
  try {
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    return { error: null, periodo, url, qr };
  } catch {
    // Sin QR el enlace igual sirve, que es lo que importa.
    return { error: null, periodo, url };
  }
}

export async function generarPago(periodo: string): Promise<PagoState> {
  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };
  if (!atLeast(membership.role, "admin")) {
    return { error: "Sólo la dueña o administración pueden pagar la cuenta." };
  }

  const cuenta = await getCuenta();
  const mes = cuenta?.meses.find((m) => m.periodo === periodo);

  if (!mes) return { error: "Ese mes no figura en tu cuenta." };
  if (mes.pagado) return { error: "Ese mes ya está pagado." };
  if (mes.total_cents <= 0) return { error: "Ese mes no tiene nada que cobrar." };

  // Ya se había generado por este mismo importe: se reusa y no se molesta a
  // Mercado Pago. La base devuelve el enlace en nulo cuando el importe cambió.
  if (mes.link) return conQr(periodo, mes.link);

  const token = serverEnv().MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return {
      error:
        "Todavía no está configurado el cobro por Mercado Pago. " +
        "Escribinos y lo arreglamos.",
    };
  }

  let url: string;
  let preferenceId: string;

  try {
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: `Dlay · ${formatMes(periodo)}`,
            description: `${mes.cantidad} turnos`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: mes.total_cents / 100,
          },
        ],
        // Con esto se sabe después qué pago corresponde a qué mes de qué
        // negocio. Sin esto, conciliar es adivinar.
        external_reference: `${membership.tenantId}:${periodo}`,
        back_urls: {
          success: `${publicEnv.NEXT_PUBLIC_SITE_URL}/configuracion/cuenta`,
          pending: `${publicEnv.NEXT_PUBLIC_SITE_URL}/configuracion/cuenta`,
          failure: `${publicEnv.NEXT_PUBLIC_SITE_URL}/configuracion/cuenta`,
        },
      }),
    });

    const datos = (await r.json()) as {
      id?: string;
      init_point?: string;
      message?: string;
      error?: string;
    };

    if (!r.ok || !datos.init_point || !datos.id) {
      // Las palabras de Mercado Pago van siempre: sin ellas, un error de
      // configuración y uno de red se leen igual.
      const suyo = datos.message ?? datos.error ?? `HTTP ${r.status}`;
      return { error: `Mercado Pago no pudo generar el cobro: ${suyo}` };
    }

    url = datos.init_point;
    preferenceId = datos.id;
  } catch {
    return { error: "No se pudo hablar con Mercado Pago. Probá de nuevo." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_link_save", {
    p_period: periodo,
    p_preference_id: preferenceId,
    p_url: url,
    // Se guarda por cuánto se hizo: si mañana el importe cambia, este cobro
    // deja de servir y se pide otro en lugar de mandar a pagar de menos.
    p_amount_cents: mes.total_cents,
  });

  if (error) return { error: "No se pudo guardar el cobro." };

  const guardado = data as unknown as { ok: boolean; error?: string };
  if (!guardado?.ok) {
    return { error: guardado?.error ?? "No se pudo guardar el cobro." };
  }

  revalidatePath("/configuracion/cuenta");
  return conQr(periodo, url);
}
