"use client";

import { useTransition } from "react";
import { anularMovimiento } from "@/lib/actions/caja";
import { METHOD_LABELS } from "@/lib/caja";
import { formatPrice } from "@/lib/money";
import type { MovementWithDetail } from "@/lib/data/caja";

export function ListaMovimientos({
  movimientos,
  timeZone,
  puedeAnular,
}: {
  movimientos: MovementWithDetail[];
  timeZone: string;
  puedeAnular: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const hora = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Los ya anulados se muestran tachados: la caja es un libro, no una lista de
  // tareas. Que se vea la corrección es parte del punto.
  const anulados = new Set(
    movimientos.map((m) => m.reverses_id).filter(Boolean) as string[],
  );

  return (
    <ul className="grid gap-2">
      {movimientos.map((m) => {
        const esIngreso = m.kind === "income";
        const anulado = anulados.has(m.id);
        const esAnulacion = m.reverses_id !== null;

        return (
          <li
            key={m.id}
            className={`flex items-center gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 py-3 ${
              anulado || esAnulacion ? "opacity-60" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[14.5px] font-medium ${
                  anulado ? "line-through" : ""
                }`}
              >
                {m.concept}
              </p>
              <p className="truncate text-[12.5px] text-muted">
                {hora.format(new Date(m.created_at))} ·{" "}
                {METHOD_LABELS[m.method]}
                {m.author?.full_name && ` · ${m.author.full_name}`}
              </p>
            </div>

            <p
              className={`shrink-0 text-[15px] font-semibold tabular-nums ${
                anulado
                  ? "text-faint line-through"
                  : esIngreso
                    ? "text-accent-text"
                    : "text-danger"
              }`}
            >
              {esIngreso ? "+" : "−"}
              {formatPrice(Number(m.amount_cents))}
            </p>

            {puedeAnular && !anulado && !esAnulacion && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(() => {
                    void anularMovimiento(m.id);
                  })
                }
                className="shrink-0 text-[12.5px] text-muted hover:text-danger disabled:opacity-50"
              >
                Anular
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
