"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createAppointment, type FormState } from "@/lib/actions/agenda";
import type { ServiceWithCategory } from "@/lib/data/services";
import { SelectorServicios } from "./selector-servicios";

const INITIAL: FormState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Agendando…" : "Agendar turno"}
    </Button>
  );
}

export function FormTurno({
  clientId,
  clientName,
  services,
  date,
}: {
  clientId: string;
  clientName: string;
  services: ServiceWithCategory[];
  date: string;
}) {
  const [state, formAction] = useActionState(createAppointment, INITIAL);
  const sent = state.values;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="clientId" value={clientId} />

      <Card>
        <CardBody className="grid gap-2">
          <CardTitle>Para {clientName}</CardTitle>
          <Link
            href="/agenda/nuevo"
            className="justify-self-start text-[13px] text-accent-text hover:underline"
          >
            Elegir otra persona
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>¿Qué se le hace?</CardTitle>
          <SelectorServicios services={services} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>¿Cuándo?</CardTitle>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="fecha" className="text-[13.5px] font-medium">
                Día
              </label>
              <input
                id="fecha"
                name="date"
                type="date"
                required
                defaultValue={sent?.date ?? date}
                className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="hora" className="text-[13.5px] font-medium">
                Hora
              </label>
              <input
                id="hora"
                name="time"
                type="time"
                step={300}
                required
                defaultValue={sent?.time ?? "09:00"}
                className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
              />
            </div>
          </div>

          <p className="text-[12.5px] leading-snug text-muted">
            Si el horario ya está completo para ese servicio, te lo avisamos al
            guardar y no se agenda nada.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Textarea
            label="Nota del turno"
            name="notes"
            maxLength={1000}
            defaultValue={sent?.notes ?? ""}
            placeholder="Viene con su hermana. Pidió que la llamemos antes."
            hint="Sólo para este turno. Lo que valga siempre va en la ficha de la clienta."
          />
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
