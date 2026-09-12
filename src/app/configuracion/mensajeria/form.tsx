"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { saveMensajeria, type FormState } from "@/lib/actions/configuracion";
import type { MessagingSettings } from "@/lib/configuracion";
import { Guardar, Resultado } from "../_components/guardar";

const INITIAL: FormState = { error: null };

export function FormMensajeria({
  settings,
  quietStart,
  quietEnd,
}: {
  settings: MessagingSettings;
  quietStart: string;
  quietEnd: string;
}) {
  const [state, action] = useActionState(saveMensajeria, INITIAL);

  return (
    <form action={action} className="grid gap-4">
      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>Franja de envío</CardTitle>
          <p className="-mt-2 text-[13.5px] leading-relaxed text-muted">
            Fuera de esta franja no sale ningún mensaje. Lo que venza de
            madrugada espera a la mañana.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="time"
              name="quietStart"
              step={900}
              defaultValue={quietStart}
              aria-label="Desde"
              className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
            />
            <span className="text-[13.5px] text-muted">a</span>
            <input
              type="time"
              name="quietEnd"
              step={900}
              defaultValue={quietEnd}
              aria-label="Hasta"
              className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Cuántos puede recibir cada persona</CardTitle>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Por día"
              name="maxPerDay"
              type="number"
              min={1}
              max={20}
              defaultValue={settings.max_per_client_per_day}
            />
            <Field
              label="Por semana"
              name="maxPerWeek"
              type="number"
              min={1}
              max={50}
              defaultValue={settings.max_per_client_per_week}
            />
          </div>

          <p className="text-[12.5px] leading-snug text-muted">
            Es la red de seguridad: si tenés varias reglas activas y todas caen
            el mismo día, esto evita que a alguien le lleguen todas juntas.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>Tope de gasto</CardTitle>
          <Field
            label="Máximo por mes"
            name="budgetPesos"
            type="number"
            min={0}
            step={1000}
            defaultValue={
              settings.monthly_budget_cents === null
                ? ""
                : Math.round(Number(settings.monthly_budget_cents) / 100)
            }
            className="w-40"
            hint="En pesos. Dejalo vacío si no querés tope. Sólo cuentan los mensajes de WhatsApp: el correo y las notificaciones no cuestan nada."
          />
        </CardBody>
      </Card>

      <Resultado state={state} />

      <div className="flex flex-wrap items-center gap-2">
        <Guardar />
        <Link
          href="/recordatorios"
          className="text-[13.5px] text-muted hover:text-ink"
        >
          Ver las reglas de recordatorio
        </Link>
      </div>
    </form>
  );
}
