import Link from "next/link";
import { longDateIn, nextDay, todayIn, weekOf } from "@/lib/tz";

/**
 * Tira de días con la cantidad de turnos de cada uno.
 *
 * Es lo primero que mira alguien al abrir la agenda: de un vistazo se ve qué
 * día está lleno y cuál está vacío, sin tener que entrar a ninguno.
 */
export function TiraSemana({
  date,
  counts,
  timeZone,
}: {
  date: string;
  counts: Record<string, number>;
  timeZone: string;
}) {
  const dias = weekOf(date);
  const hoy = todayIn(timeZone);

  const nombreDia = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "short",
  });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/agenda?dia=${nextDay(date, -7)}`}
          aria-label="Semana anterior"
          className="rounded-pill border-[1.5px] border-line bg-surface px-3 py-1.5 text-[13px] text-muted hover:text-ink"
        >
          ←
        </Link>

        <p className="text-[13.5px] font-medium capitalize">
          {longDateIn(date, timeZone)}
        </p>

        <Link
          href={`/agenda?dia=${nextDay(date, 7)}`}
          aria-label="Semana siguiente"
          className="rounded-pill border-[1.5px] border-line bg-surface px-3 py-1.5 text-[13px] text-muted hover:text-ink"
        >
          →
        </Link>
      </div>

      <ol className="grid grid-cols-7 gap-1.5">
        {dias.map((d) => {
          const activo = d === date;
          const esHoy = d === hoy;
          const cantidad = counts[d] ?? 0;
          const numero = Number(d.slice(-2));

          return (
            <li key={d}>
              <Link
                href={`/agenda?dia=${d}`}
                aria-current={activo ? "date" : undefined}
                className={`grid justify-items-center gap-0.5 rounded-[16px] border-[1.5px] px-1 py-2 ${
                  activo
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-surface hover:border-accent"
                }`}
              >
                <span className="text-[10.5px] uppercase tracking-wider opacity-70">
                  {nombreDia.format(new Date(`${d}T12:00:00Z`)).replace(".", "")}
                </span>
                <span
                  className={`text-[17px] font-semibold tabular-nums ${
                    esHoy && !activo ? "text-accent-text" : ""
                  }`}
                >
                  {numero}
                </span>
                <span
                  className={`text-[10.5px] tabular-nums ${
                    activo ? "opacity-80" : "text-faint"
                  }`}
                >
                  {cantidad > 0 ? cantidad : "—"}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
