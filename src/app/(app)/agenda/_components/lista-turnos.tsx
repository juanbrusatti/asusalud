import Link from "next/link";
import { formatPrice } from "@/lib/money";
import { timeIn } from "@/lib/tz";
import {
  STATUS_LABELS,
  type AgendaBlock,
  type AppointmentStatus,
  type AppointmentWithDetail,
} from "@/lib/data/agenda";

/**
 * El color dice de un vistazo quién va a venir.
 *
 * «Sin confirmar» es neutro a propósito: todavía no pasó nada, no es una
 * alerta. El ámbar queda libre para el turno que se movió, que sí es algo que
 * conviene mirar antes de empezar el día.
 */
const STATUS_STYLE: Record<AppointmentStatus, string> = {
  pending: "bg-surface-2 text-muted",
  confirmed: "bg-ok-wash text-ok",
  attended: "bg-surface-2 text-muted",
  no_show: "bg-danger-wash text-danger",
  cancelled: "bg-surface-2 text-faint",
};

export function ListaTurnos({
  appointments,
  blocks,
  timeZone,
}: {
  appointments: AppointmentWithDetail[];
  blocks: AgendaBlock[];
  timeZone: string;
}) {
  // Los turnos que se pisan comparten hora de inicio: se agrupan para que se
  // lea "a las 09:00 hay tres" en vez de tres filas sueltas repitiendo la hora.
  const porHora = new Map<string, AppointmentWithDetail[]>();
  for (const a of appointments) {
    const hora = timeIn(a.starts_at, timeZone);
    porHora.set(hora, [...(porHora.get(hora) ?? []), a]);
  }

  return (
    <div className="grid gap-3">
      {blocks.map((b) => (
        <div
          key={b.id}
          className="rounded-card border-[1.5px] border-dashed border-line bg-surface-2 px-4 py-3"
        >
          <p className="text-[13px] font-semibold tabular-nums text-muted">
            {timeIn(b.starts_at, timeZone)} – {timeIn(b.ends_at, timeZone)}
          </p>
          <p className="text-[13.5px] text-muted">
            Agenda bloqueada{b.reason ? `: ${b.reason}` : ""}
          </p>
        </div>
      ))}

      {[...porHora.entries()].map(([hora, turnos]) => (
        <section key={hora} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
          <p className="pt-3.5 text-[14px] font-semibold tabular-nums text-muted">
            {hora}
          </p>

          <ul className="grid gap-2">
            {turnos.map((a) => {
              const cliente = a.client;
              const nombre = cliente
                ? [cliente.first_name, cliente.last_name]
                    .filter(Boolean)
                    .join(" ")
                : "Sin cliente";
              const cancelado = a.status === "cancelled";

              return (
                <li key={a.id}>
                  <Link
                    href={`/agenda/${a.id}`}
                    className={`flex items-center gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 py-3 hover:border-accent ${
                      cancelado ? "opacity-55" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-[15px] font-semibold">
                          {nombre}
                        </p>
                        {cliente?.alert && (
                          <span className="rounded-pill bg-warn-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                            Atención
                          </span>
                        )}
                        {/* Un turno que ya se movió es el que más chances
                            tiene de volver a moverse. El equipo lo usa para
                            saber a quién conviene llamar. */}
                        {a.rescheduled_count > 0 && !cancelado && (
                          <span className="rounded-pill bg-warn-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                            Cambiado
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-muted">
                        {a.services.map((s) => s.service?.name).join(" + ")} ·{" "}
                        {timeIn(a.starts_at, timeZone)}–
                        {timeIn(a.ends_at, timeZone)}
                      </p>
                    </div>

                    <div className="grid shrink-0 justify-items-end gap-1">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${STATUS_STYLE[a.status]}`}
                      >
                        {STATUS_LABELS[a.status]}
                      </span>
                      {a.price_cents > 0 && (
                        <span className="text-[13px] tabular-nums text-muted">
                          {formatPrice(a.price_cents)}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
