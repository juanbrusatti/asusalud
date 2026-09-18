import type { NextRequest } from "next/server";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { armarCsv, respuestaCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/data/agenda";
import { formatPrice } from "@/lib/money";
import { zonedDayRange } from "@/lib/tz";

/**
 * Los turnos de un período.
 *
 * Sirve para llevarse el historial, y también para lo aburrido de todos los
 * meses: pasarle al contador qué se facturó. Por eso incluye el precio y el
 * estado, no sólo quién y cuándo.
 */
export async function GET(request: NextRequest) {
  const membership = await getCurrentTenant();
  if (!membership) return new Response("No encontramos tu negocio.", { status: 404 });

  if (!atLeast(membership.role, "reception")) {
    return new Response("No tenés permiso para esto.", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return new Response("Elegí desde qué día hasta qué día.", { status: 400 });
  }
  if (hasta < desde) {
    return new Response("El período termina antes de empezar.", { status: 400 });
  }

  const tz = membership.tenant.timezone;
  // Los días son los del negocio, no los del UTC: un turno de las 22:30 del
  // lunes pertenece al lunes aunque en Londres ya sea martes.
  const { from } = zonedDayRange(desde, tz);
  const { to } = zonedDayRange(hasta, tz);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `starts_at, ends_at, status, source, price_cents, moved_count, notes,
       client:clients ( first_name, last_name, phone_e164 ),
       services:appointment_services ( service:services ( name ) )`,
    )
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at");

  if (error) return new Response("No se pudo leer.", { status: 500 });

  const dia = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const csv = armarCsv(
    [
      "Día",
      "Hora",
      "Cliente",
      "Teléfono",
      "Servicios",
      "Estado",
      "Movido",
      "Origen",
      "Precio",
      "Notas",
    ],
    (data ?? []).map((a) => {
      const c = a.client as { first_name?: string; last_name?: string; phone_e164?: string } | null;
      const servicios = (a.services ?? [])
        .map((s) => (s.service as { name?: string } | null)?.name)
        .filter(Boolean)
        .join(" + ");

      return [
        dia.format(new Date(a.starts_at)),
        hora.format(new Date(a.starts_at)),
        [c?.first_name, c?.last_name].filter(Boolean).join(" "),
        c?.phone_e164 ?? "",
        servicios,
        STATUS_LABELS[a.status],
        a.moved_count > 0 ? "sí" : "",
        a.source === "online" ? "reserva online" : a.source === "import" ? "importado" : "mostrador",
        formatPrice(a.price_cents),
        a.notes ?? "",
      ];
    }),
  );

  return respuestaCsv(
    `turnos-${membership.tenant.slug}-${desde}-a-${hasta}.csv`,
    csv,
  );
}
