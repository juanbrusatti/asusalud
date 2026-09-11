"use client";

import { useState } from "react";
import { formatDuration, formatPrice } from "@/lib/money";
import type { ServiceWithCategory } from "@/lib/data/services";

/**
 * Elegir qué se le hace. Muestra el total de tiempo y de plata mientras se
 * elige: saber que el turno va a durar una hora y media importa ANTES de
 * elegir el horario, no después.
 */
export function SelectorServicios({
  services,
  defaultSelected = [],
}: {
  services: ServiceWithCategory[];
  defaultSelected?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  const elegidos = selected
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is ServiceWithCategory => Boolean(s));

  const minutos = elegidos.reduce((sum, s) => sum + s.duration_minutes, 0);
  const limpieza = elegidos.length
    ? Math.max(...elegidos.map((s) => s.buffer_minutes))
    : 0;
  const total = elegidos.reduce((sum, s) => sum + (s.price_cents ?? 0), 0);
  const aConvenir = elegidos.some((s) => s.price_cents === null);

  function alternar(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="grid gap-3">
      {selected.map((id) => (
        <input key={id} type="hidden" name="serviceIds" value={id} />
      ))}

      <ul className="grid gap-1.5">
        {services.map((s) => {
          const activo = selected.includes(s.id);
          const orden = selected.indexOf(s.id) + 1;

          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => alternar(s.id)}
                aria-pressed={activo}
                className={`flex w-full items-center gap-3 rounded-[16px] border-[1.5px] px-3.5 py-2.5 text-left ${
                  activo
                    ? "border-accent bg-accent-wash"
                    : "border-line bg-surface hover:border-accent"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                    activo
                      ? "bg-accent text-on-accent"
                      : "border-[1.5px] border-line text-faint"
                  }`}
                >
                  {activo ? orden : ""}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">
                    {s.name}
                  </span>
                  <span className="block text-[12.5px] text-muted">
                    {formatDuration(s.duration_minutes)}
                    {s.capacity > 1 && ` · ${s.capacity} a la vez`}
                  </span>
                </span>

                <span className="shrink-0 text-[13.5px] tabular-nums text-muted">
                  {formatPrice(s.price_cents)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {elegidos.length > 0 && (
        <div className="rounded-[16px] bg-surface-2 px-4 py-3 text-[13.5px]">
          <p>
            <strong>{formatDuration(minutos)}</strong> de atención
            {limpieza > 0 && (
              <> más {limpieza} min de limpieza que ocupan agenda</>
            )}
            .
          </p>
          <p className="mt-0.5 text-muted">
            Total: <strong className="text-ink">{formatPrice(total)}</strong>
            {aConvenir && " más lo que se convenga"}
          </p>
        </div>
      )}
    </div>
  );
}
