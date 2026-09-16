"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { saveHorarios, type FormState } from "@/lib/actions/configuracion";
import { WEEKDAYS } from "@/lib/configuracion";
import { Guardar, Resultado } from "../_components/guardar";

const INITIAL: FormState = { error: null };

type Franja = { weekday: number; opens: string; closes: string };

/**
 * Los horarios, día por día.
 *
 * Cada día puede tener más de una franja: es lo que permite cortar al mediodía,
 * que es como trabajan muchos negocios. Un día sin franjas es un día cerrado.
 */
export function FormHorarios({ franjas }: { franjas: Franja[] }) {
  const [state, action] = useActionState(saveHorarios, INITIAL);
  const [filas, setFilas] = useState<Franja[]>(franjas);

  const delDia = (weekday: number) =>
    filas.filter((f) => f.weekday === weekday);

  function agregar(weekday: number) {
    const existentes = delDia(weekday);
    // La franja nueva arranca donde terminó la anterior, que es lo que casi
    // siempre se quiere después de un corte al mediodía.
    const desde = existentes.length > 0 ? existentes[existentes.length - 1].closes : "09:00";
    setFilas([...filas, { weekday, opens: desde, closes: "19:00" }]);
  }

  function quitar(index: number) {
    setFilas(filas.filter((_, i) => i !== index));
  }

  function cambiar(index: number, campo: "opens" | "closes", valor: string) {
    setFilas(filas.map((f, i) => (i === index ? { ...f, [campo]: valor } : f)));
  }

  return (
    <form action={action} className="grid gap-4">
      {filas.map((f) => (
        <input
          key={`${f.weekday}-${f.opens}-${f.closes}`}
          type="hidden"
          name="franja"
          value={`${f.weekday}|${f.opens}|${f.closes}`}
        />
      ))}

      <Card>
        <CardBody className="grid gap-4">
          {WEEKDAYS.map((dia) => {
            const suyas = filas
              .map((f, i) => ({ ...f, index: i }))
              .filter((f) => f.weekday === dia.value);

            return (
              <div
                key={dia.value}
                className="grid gap-2 border-b border-line-soft pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14.5px] font-semibold">
                    {dia.label}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => agregar(dia.value)}
                  >
                    + Franja
                  </Button>
                </div>

                {suyas.length === 0 ? (
                  <p className="text-[13px] text-faint">Cerrado</p>
                ) : (
                  suyas.map((f) => (
                    <div key={f.index} className="flex items-center gap-2">
                      <input
                        type="time"
                        step={900}
                        value={f.opens}
                        aria-label={`${dia.label}, desde`}
                        onChange={(e) =>
                          cambiar(f.index, "opens", e.target.value)
                        }
                        className="h-10 rounded-[12px] border-[1.5px] border-line bg-surface px-2.5 text-[14px]"
                      />
                      <span className="text-[13px] text-muted">a</span>
                      <input
                        type="time"
                        step={900}
                        value={f.closes}
                        aria-label={`${dia.label}, hasta`}
                        onChange={(e) =>
                          cambiar(f.index, "closes", e.target.value)
                        }
                        className="h-10 rounded-[12px] border-[1.5px] border-line bg-surface px-2.5 text-[14px]"
                      />
                      <button
                        type="button"
                        onClick={() => quitar(f.index)}
                        aria-label={`Quitar franja de ${dia.label}`}
                        className="ml-auto grid h-8 w-8 place-items-center rounded-full border-[1.5px] border-line text-[13px] text-muted hover:text-danger"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <p className="text-[12.5px] leading-snug text-muted">
        Un día sin franjas queda cerrado. Para cortar al mediodía, cargá dos:
        por ejemplo de 9 a 13 y de 16 a 20.
      </p>

      <Resultado state={state} />

      <div className="flex">
        <Guardar label="Guardar horarios" />
      </div>
    </form>
  );
}
