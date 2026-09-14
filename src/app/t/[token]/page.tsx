import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { AvisosCliente } from "@/components/pwa/avisos-cliente";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { Card, CardBody } from "@/components/ui/card";
import { getManageView } from "@/lib/data/autogestion";
import { publicEnv } from "@/lib/env";
import { formatDuration, formatPrice } from "@/lib/money";
import { longDateIn, timeIn } from "@/lib/tz";
import { Acciones } from "./_components/acciones";

export const metadata: Metadata = {
  title: "Tu turno",
  // Un enlace que es una llave no tiene por qué terminar en un buscador.
  robots: { index: false, follow: false },
};

const ESTADOS: Record<string, string> = {
  pending: "Sin confirmar",
  confirmed: "Confirmado",
  attended: "Ya viniste",
  no_show: "No viniste",
  cancelled: "Cancelado",
};

/**
 * El turno visto por el cliente.
 *
 * No hay cuenta ni contraseña: el enlace es la llave. Pedirle a alguien que se
 * registre para avisar que no puede venir es garantizar que no avise.
 */
export default async function TurnoPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const vista = await getManageView(token);

  if (!vista) {
    return (
      <main className="mx-auto grid max-w-md gap-5 px-4 py-16">
        <Logo className="h-10 w-10" />
        <Card>
          <CardBody className="grid gap-2">
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">
              No encontramos este turno
            </h1>
            <p className="text-[14.5px] leading-relaxed text-muted">
              Puede que el enlace esté viejo o que lo hayan copiado a medias.
              Si tenías un turno y no estás seguro, escribile al negocio.
            </p>
          </CardBody>
        </Card>
      </main>
    );
  }

  const { tenant, appointment } = vista;
  const tz = tenant.timezone;

  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(appointment.startsAt));

  const activo =
    appointment.status === "pending" || appointment.status === "confirmed";

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-10">
      <RegisterServiceWorker />

      <header className="grid gap-3">
        <Logo className="h-10 w-10" />
        <p className="text-[14.5px] text-muted">
          {appointment.firstName ? `Hola ${appointment.firstName}, este es` : "Este es"}{" "}
          tu turno en{" "}
          <span className="font-medium text-ink">{tenant.name}</span>
        </p>
      </header>

      <Card accent={activo}>
        <CardBody className="grid gap-3">
          <p
            className={`text-[11.5px] font-semibold uppercase tracking-wider ${
              activo ? "opacity-75" : "text-muted"
            }`}
          >
            {ESTADOS[appointment.status] ?? appointment.status}
          </p>

          <p className="font-hand text-[34px] capitalize leading-none">
            {longDateIn(dia, tz)}
          </p>
          <p className="text-[20px] font-semibold tabular-nums">
            {timeIn(appointment.startsAt, tz)} a{" "}
            {timeIn(appointment.endsAt, tz)}
          </p>

          <ul
            className={`grid gap-1 border-t-[1.5px] pt-3 text-[14.5px] ${
              activo ? "border-white/25" : "border-line"
            }`}
          >
            {appointment.services.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex justify-between gap-3">
                <span>{s.name}</span>
                <span className={activo ? "opacity-75" : "text-muted"}>
                  {formatDuration(s.minutes)}
                </span>
              </li>
            ))}
          </ul>

          {appointment.priceCents !== null && (
            <p className="text-[14.5px] tabular-nums">
              {formatPrice(appointment.priceCents)}
            </p>
          )}
        </CardBody>
      </Card>

      <Acciones token={token} vista={vista} />

      {activo && (
        <AvisosCliente
          token={token}
          vapidPublicKey={publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        />
      )}

      {vista.bookingOpen && !activo && (
        <Card>
          <CardBody className="grid justify-items-start gap-3">
            <p className="text-[14.5px] leading-relaxed">
              ¿Querés sacar otro turno? Elegí el día y el horario que te quede
              cómodo.
            </p>
            <Link
              href={`/r/${tenant.slug}`}
              className="rounded-pill bg-accent px-5 py-2.5 text-[14.5px] font-medium text-on-accent"
            >
              Sacar un turno
            </Link>
          </CardBody>
        </Card>
      )}

      <p className="px-1 text-[12px] leading-relaxed text-faint">
        Este enlace es sólo tuyo y sirve para este turno. Guardalo si querés
        volver a verlo.
      </p>
    </main>
  );
}
