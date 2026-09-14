import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import {
  STATUS_LABELS,
  getAppointment,
  getStatusHistory,
} from "@/lib/data/agenda";
import { getAppointmentCharges, getOpenSession } from "@/lib/data/caja";
import { formatDuration, formatPrice } from "@/lib/money";
import { whatsappLink } from "@/lib/phone";
import { longDateIn, timeIn } from "@/lib/tz";
import { AccionesEstado } from "../_components/acciones-estado";
import { Cobro } from "../_components/cobro";

export const metadata: Metadata = { title: "Turno" };

export default async function TurnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const appointment = await getAppointment(id);
  if (!appointment) notFound();

  const history = await getStatusHistory(id);
  const tz = membership.tenant.timezone;

  // Un profesional no ve la plata del negocio: tampoco desde el turno.
  const puedeCobrar = atLeast(membership.role, "reception");
  const [cobros, cajaAbierta] = puedeCobrar
    ? await Promise.all([getAppointmentCharges(id), getOpenSession()])
    : [null, null];

  const cliente = appointment.client;
  const nombre = cliente
    ? [cliente.first_name, cliente.last_name].filter(Boolean).join(" ")
    : "Sin cliente";

  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(appointment.starts_at));

  // Lo que se va a leer en la caja dentro de un mes. El nombre va adentro
  // porque la lista de movimientos muestra el concepto y nada más.
  const nombresServicios = appointment.services
    .map((s) => s.service?.name)
    .filter(Boolean) as string[];
  const conceptoSugerido = [
    nombresServicios.slice(0, 2).join(", ") +
      (nombresServicios.length > 2 ? ` +${nombresServicios.length - 2}` : ""),
    cliente ? nombre : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);

  const wa = whatsappLink(cliente?.phone_e164);
  const fechaHora = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-8">
        <div>
          <Link
            href={`/agenda?dia=${dia}`}
            className="text-[13px] text-muted hover:text-ink"
          >
            ← Agenda
          </Link>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
            {nombre}
          </h1>
          <p className="mt-1 text-[14.5px] capitalize text-muted">
            {longDateIn(dia, tz)} · {timeIn(appointment.starts_at, tz)} a{" "}
            {timeIn(appointment.ends_at, tz)}
          </p>
        </div>

        {cliente?.alert && (
          <div className="rounded-card border-[1.5px] border-warn bg-warn-wash px-4 py-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-warn">
              Atención
            </p>
            <p className="mt-0.5 text-[14.5px] leading-relaxed text-ink">
              {cliente.alert}
            </p>
          </div>
        )}

        <Card>
          <CardBody className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{STATUS_LABELS[appointment.status]}</CardTitle>
              <div className="flex gap-2">
                {wa && (
                  <Button asChild variant="outline" size="sm">
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      Abrir chat
                    </a>
                  </Button>
                )}
                {cliente && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/clientes/${cliente.id}`}>Ver ficha</Link>
                  </Button>
                )}
              </div>
            </div>

            {appointment.cancel_reason && (
              <p className="text-[13.5px] text-muted">
                Motivo: {appointment.cancel_reason}
              </p>
            )}

            <AccionesEstado id={id} status={appointment.status} />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>Qué se le hace</CardTitle>
            <ul className="grid gap-1.5">
              {appointment.services.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 text-[14.5px]"
                >
                  <span>{s.service?.name ?? "Servicio eliminado"}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatDuration(s.duration_minutes)} ·{" "}
                    {formatPrice(s.price_cents)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t-[1.5px] border-line pt-3 text-[15px] font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatPrice(appointment.price_cents)}
              </span>
            </div>

            <p className="text-[12.5px] leading-snug text-muted">
              Es el precio que tenían los servicios cuando se agendó. Si después
              cambian, este turno no se toca.
            </p>
          </CardBody>
        </Card>

        {cobros && appointment.status !== "cancelled" && (
          <Cobro
            appointmentId={id}
            clientId={cliente?.id ?? null}
            totalCents={
              appointment.price_cents === null
                ? null
                : Number(appointment.price_cents)
            }
            paidCents={cobros.paidCents}
            conceptoSugerido={conceptoSugerido}
            cajaAbierta={cajaAbierta !== null}
            timeZone={tz}
            movimientos={cobros.movements.map((m) => ({
              id: m.id,
              kind: m.kind,
              method: m.method,
              amountCents: Number(m.amount_cents),
              concept: m.concept,
              createdAt: m.created_at,
              esAnulacion: m.reverses_id !== null,
            }))}
          />
        )}

        {appointment.notes && (
          <Card>
            <CardBody className="grid gap-2">
              <CardTitle>Nota del turno</CardTitle>
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">
                {appointment.notes}
              </p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>Qué pasó con este turno</CardTitle>
            <ol className="grid gap-2">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="border-l-[2.5px] border-line pl-3.5 text-[13.5px]"
                >
                  <p>
                    {/* Reprogramar no cambia el estado: la fila queda con el
                        mismo de un lado y del otro, y lo que cuenta la
                        historia es el motivo. */}
                    {h.from_status === h.to_status
                      ? h.reason
                      : h.from_status
                        ? `${STATUS_LABELS[h.from_status]} → ${STATUS_LABELS[h.to_status]}`
                        : `Agendado como ${STATUS_LABELS[h.to_status]}`}
                    {h.reason && h.from_status !== h.to_status && (
                      <span className="text-muted"> · {h.reason}</span>
                    )}
                  </p>
                  <p className="text-[12px] text-faint">
                    {h.by_client
                      ? "El cliente"
                      : (h.author?.full_name ?? "Alguien del equipo")}{" "}
                    · {fechaHora.format(new Date(h.created_at))}
                  </p>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </main>
    </>
  );
}
