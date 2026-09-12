"use client";

import { useActionState } from "react";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { saveReservas, type FormState } from "@/lib/actions/configuracion";
import type { BookingSettings } from "@/lib/configuracion";
import { Guardar, Resultado } from "../_components/guardar";

const INITIAL: FormState = { error: null };

export function FormReservas({
  settings,
  link,
}: {
  settings: BookingSettings;
  link: string;
}) {
  const [state, action] = useActionState(saveReservas, INITIAL);

  return (
    <form action={action} className="grid gap-4">
      <Card>
        <CardBody className="grid gap-4">
          <Toggle
            name="enabled"
            label="Agenda abierta al público"
            hint="Con esto apagado, el link de reservas no muestra nada. Podés dejar todo configurado y abrirlo cuando quieras."
            defaultChecked={settings.enabled}
          />

          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-muted">
              Tu link
            </span>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all rounded-[14px] bg-surface-2 px-3.5 py-2.5 font-mono text-[13px] text-accent-text hover:underline"
            >
              {link}
            </a>
            <p className="text-[12.5px] leading-snug text-muted">
              Ponelo en tu perfil de Instagram o mandáselo a tus clientas.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Con cuánta anticipación</CardTitle>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Anticipación mínima"
              name="minAdvanceHours"
              type="number"
              min={0}
              max={720}
              defaultValue={settings.min_advance_hours}
              hint="En horas. Con 2, nadie puede sacar turno para dentro de un rato."
            />
            <Field
              label="Hasta cuántos días adelante"
              name="maxDaysAhead"
              type="number"
              min={1}
              max={365}
              defaultValue={settings.max_days_ahead}
              hint="Cuánto se puede reservar hacia el futuro."
            />
          </div>

          <Select
            label="Cada cuánto se ofrece un horario"
            name="slotMinutes"
            defaultValue={String(settings.slot_minutes)}
            hint="Con 15 se ofrecen las 9:00, 9:15, 9:30… Cuanto más chico, más opciones pero más huecos sueltos."
          >
            {[5, 10, 15, 20, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </Select>

          <Field
            label="Turnos a futuro por persona"
            name="maxOpenPerClient"
            type="number"
            min={1}
            max={20}
            defaultValue={settings.max_open_per_client}
            className="w-32"
            hint="El freno contra quien reserva media agenda y después no viene."
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Qué ven tus clientas</CardTitle>

          <Toggle
            name="showPrices"
            label="Mostrar los precios"
            hint="Si lo apagás, el precio ni siquiera se manda al navegador."
            defaultChecked={settings.show_prices}
          />

          <Textarea
            label="Texto de bienvenida"
            name="welcomeText"
            maxLength={400}
            defaultValue={settings.welcome_text ?? ""}
            placeholder="Depilación definitiva, tratamientos faciales y masajes."
            hint="Un par de líneas, arriba de todo. Opcional."
          />

          <Field
            label="Cómo llegar"
            name="addressNote"
            maxLength={200}
            defaultValue={settings.address_note ?? ""}
            placeholder="Santiago del Estero 1130, Río Cuarto. Timbre 2."
          />
        </CardBody>
      </Card>

      <Resultado state={state} />

      <div className="flex">
        <Guardar />
      </div>
    </form>
  );
}
