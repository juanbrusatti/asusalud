"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { createBlock, type FormState } from "@/lib/actions/agenda";

const INITIAL: FormState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Bloqueando…" : "Bloquear"}
    </Button>
  );
}

export function FormBloqueo({ date }: { date: string }) {
  const [state, formAction] = useActionState(createBlock, INITIAL);

  return (
    <form action={formAction} className="grid gap-4">
      <Card>
        <CardBody className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="dia" className="text-[13.5px] font-medium">
              Día
            </label>
            <input
              id="dia"
              name="date"
              type="date"
              required
              defaultValue={date}
              className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="desde" className="text-[13.5px] font-medium">
                Desde
              </label>
              <input
                id="desde"
                name="from"
                type="time"
                step={300}
                required
                defaultValue="09:00"
                className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="hasta" className="text-[13.5px] font-medium">
                Hasta
              </label>
              <input
                id="hasta"
                name="to"
                type="time"
                step={300}
                required
                defaultValue="13:00"
                className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
              />
            </div>
          </div>

          <Field
            label="Motivo"
            name="reason"
            maxLength={200}
            placeholder="Turno médico"
            hint="Opcional. Se ve sólo dentro del negocio, nunca del lado del cliente."
          />

          <p className="text-[12.5px] leading-snug text-muted">
            El bloqueo se muestra en la agenda y lo va a respetar la reserva
            online. No cancela los turnos que ya estén puestos en ese rato.
          </p>
        </CardBody>
      </Card>

      {state.error && (
        <p
          role="alert"
          className="rounded-[14px] bg-danger-wash px-4 py-3 text-[13.5px] text-danger"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Submit />
        <Button asChild variant="ghost" size="lg">
          <Link href={`/agenda?dia=${date}`}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
