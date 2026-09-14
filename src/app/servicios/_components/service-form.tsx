"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { centsToInput } from "@/lib/money";
import type { FormState } from "@/lib/actions/services";
import type { Service, ServiceCategory } from "@/lib/data/services";

const INITIAL: FormState = { error: null };

/** Las duraciones que un negocio usa el 95% del tiempo. */
const DURACIONES = [15, 20, 30, 40, 45, 60, 90];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function ServiceForm({
  action,
  service,
  categories,
  submitLabel,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  service?: Service;
  categories: ServiceCategory[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  /**
   * Tras un error, los valores que volvieron del servidor ganan sobre los del
   * servicio guardado: son los que la persona acababa de escribir.
   */
  const sent = state.values;
  const text = (key: string, fallback: string) => sent?.[key] ?? fallback;
  const checkbox = (key: string, fallback: boolean) =>
    sent ? sent[key] === "on" : fallback;

  const [duracion, setDuracion] = useState(
    Number(sent?.durationMinutes) || service?.duration_minutes || 30,
  );
  const [aConvenir, setAConvenir] = useState(
    checkbox("onRequest", service?.price_mode === "on_request"),
  );

  return (
    <form action={formAction} className="grid gap-4">
      <Card>
        <CardBody className="grid gap-5">
          <Field
            label="Nombre del servicio"
            name="name"
            required
            minLength={2}
            defaultValue={text("name", service?.name ?? "")}
            placeholder="Depilación definitiva"
            autoFocus={!service}
          />

          <Select
            label="Categoría"
            name="categoryId"
            defaultValue={text("categoryId", service?.category_id ?? "")}
            hint="Opcional. Sirve para que un listado largo siga siendo legible."
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Textarea
            label="Descripción"
            name="description"
            maxLength={500}
            defaultValue={text("description", service?.description ?? "")}
            placeholder="Qué incluye y cuántas sesiones suele llevar."
            hint="Se muestra en la reserva online. Opcional."
          />

          <Textarea
            label="Cómo prepararse"
            name="preparationNote"
            maxLength={300}
            rows={3}
            defaultValue={text(
              "preparationNote",
              service?.preparation_note ?? "",
            )}
            placeholder="No te depiles con cera ni pinza 15 días antes, y vení sin cremas."
            hint="Va dentro del recordatorio de este servicio. Escribilo como se lo dirías al cliente, que lo va a leer tal cual."
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Tiempo y cupos</CardTitle>

          <div className="grid gap-2">
            <span className="text-[13.5px] font-medium text-ink">Duración</span>
            <div className="flex flex-wrap gap-1.5">
              {DURACIONES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDuracion(m)}
                  aria-pressed={duracion === m}
                  className={`rounded-pill border-[1.5px] px-3.5 py-1.5 text-[13px] font-medium ${
                    duracion === m
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
            <input
              type="number"
              name="durationMinutes"
              min={5}
              max={600}
              step={5}
              required
              value={duracion}
              onChange={(e) => setDuracion(Number(e.target.value))}
              aria-label="Duración en minutos"
              className="mt-1 h-11 w-32 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
            />
            <p className="text-[12.5px] leading-snug text-muted">
              Cuánto ocupa el turno en la agenda. Si no está en los atajos,
              escribila a mano.
            </p>
          </div>

          <Field
            label="Preparación y limpieza"
            name="bufferMinutes"
            type="number"
            min={0}
            max={120}
            step={5}
            defaultValue={text("bufferMinutes", String(service?.buffer_minutes ?? 0))}
            className="w-32"
            hint="Minutos que quedan bloqueados después del turno. Ocupan agenda pero no se cobran ni se le muestran al cliente."
          />

          <Field
            label="Turnos simultáneos"
            name="capacity"
            type="number"
            min={1}
            max={50}
            defaultValue={text("capacity", String(service?.capacity ?? 1))}
            className="w-32"
            hint="Cuántas personas podés atender a la vez con este servicio. Si el aparato trabaja solo mientras atendés a otro cliente, poné 2 o 3. Un masaje es siempre 1."
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Precio</CardTitle>

          <Toggle
            name="onRequest"
            label="A convenir"
            hint="Para servicios cuyo precio depende de la zona o la cantidad de sesiones. No aparece un precio en la reserva online."
            defaultChecked={aConvenir}
            onChange={setAConvenir}
          />

          {!aConvenir && (
            <Field
              label="Precio"
              name="price"
              inputMode="numeric"
              required
              defaultValue={text("price", centsToInput(service?.price_cents))}
              placeholder="10000"
              className="w-44"
              hint="En pesos. Cada vez que lo cambies queda registrado, para que los informes valúen cada turno al precio que tenía ese día."
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Disponibilidad</CardTitle>

          <Toggle
            name="isActive"
            label="Activo"
            hint="Si lo apagás deja de aparecer al agendar. Los turnos que ya existen no se tocan."
            defaultChecked={checkbox("isActive", service?.is_active ?? true)}
          />

          <Toggle
            name="isBookableOnline"
            label="Se puede reservar online"
            hint="Apagalo para los servicios que preferís agendar hablando, como una primera consulta."
            defaultChecked={checkbox(
              "isBookableOnline",
              service?.is_bookable_online ?? true,
            )}
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
        <Submit label={submitLabel} />
        <Button asChild variant="ghost" size="lg">
          <Link href="/servicios">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
