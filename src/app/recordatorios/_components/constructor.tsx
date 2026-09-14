"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { formatPrice } from "@/lib/money";
import {
  CHANNEL_LABELS,
  OFFSET_PRESETS,
  TRIGGER_LABELS,
  describeOffset,
  type Channel,
  type RuleWithTemplates,
  type Simulation,
  type Template,
  type Trigger,
} from "@/lib/recordatorios";
import { saveRule, simulateRule, type FormState } from "@/lib/actions/recordatorios";
import type { ServiceWithCategory } from "@/lib/data/services";

const INITIAL: FormState = { error: null };
const CHANNELS: Channel[] = ["push", "email", "whatsapp"];

/**
 * El correo está entero y funciona, pero esta instalación todavía no tiene
 * proveedor configurado. No se ofrece —elegir un canal que no puede entregar
 * es peor que no tenerlo— pero tampoco se borra de las reglas que ya lo
 * tengan: el día que se active, vuelven a usarlo solas.
 */
function canalesOfrecidos(correoDisponible: boolean): Channel[] {
  return correoDisponible ? CHANNELS : CHANNELS.filter((c) => c !== "email");
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

/**
 * El constructor "cuando → entonces".
 *
 * La pieza que lo distingue de cualquier otro formulario es el simulador: a
 * medida que se arma la regla se ve a cuánta gente le va a llegar, por qué
 * canal y cuánto cuesta. Nadie tendría que enterarse del precio de una campaña
 * en la factura del mes siguiente.
 */
export function Constructor({
  rule,
  templates,
  correoDisponible,
  services,
  submitLabel,
}: {
  rule?: RuleWithTemplates;
  templates: Template[];
  correoDisponible: boolean;
  services: ServiceWithCategory[];
  submitLabel: string;
}) {
  const action = saveRule.bind(null, rule?.id ?? null);
  const [state, formAction] = useActionState(action, INITIAL);

  const [trigger, setTrigger] = useState<Trigger>(
    rule?.trigger ?? "before_appointment",
  );
  const [offset, setOffset] = useState(Math.abs(rule?.offset_minutes ?? 1440));
  const [channels, setChannels] = useState<Channel[]>(
    (rule?.channel_order as Channel[]) ?? ["push", "email", "whatsapp"],
  );
  const [serviceIds, setServiceIds] = useState<string[]>(
    rule?.service_ids ?? [],
  );
  const [onlyIfMissed, setOnlyIfMissed] = useState(rule?.only_if_missed ?? false);

  const [sim, setSim] = useState<Simulation>([]);
  const [simulando, startSim] = useTransition();

  // Se recalcula con una pequeña espera: mover un control no tiene que
  // disparar una consulta por cada tecla.
  useEffect(() => {
    // Sin canales no hay nada que consultar. No se limpia el estado acá para
    // no encadenar renders: el valor mostrado se deriva más abajo.
    if (channels.length === 0) return;

    const timer = setTimeout(() => {
      startSim(async () => {
        setSim(
          await simulateRule({
            trigger,
            offsetMinutes: offset,
            channelOrder: channels,
            serviceIds,
            onlyIfMissed,
          }),
        );
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [trigger, offset, channels, serviceIds, onlyIfMissed]);

  const visible: Simulation = channels.length === 0 ? [] : sim;
  const alcanzados = visible
    .filter((s) => s.channel !== null)
    .reduce((n, s) => n + s.recipients, 0);
  const sinCanal = visible.find((s) => s.channel === null)?.recipients ?? 0;
  const costo = visible.reduce((n, s) => n + s.cost_cents, 0);

  const presets = OFFSET_PRESETS.filter((p) =>
    trigger === "before_appointment" ? p.minutes < 0 : p.minutes > 0,
  );
  const usaMomento = trigger !== "birthday";

  function moverCanal(ch: Channel, direccion: -1 | 1) {
    const i = channels.indexOf(ch);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= channels.length) return;
    const copia = [...channels];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    setChannels(copia);
  }

  return (
    <form action={formAction} className="grid gap-4">
      {channels.map((ch) => (
        <input key={ch} type="hidden" name="channelOrder" value={ch} />
      ))}
      {serviceIds.map((id) => (
        <input key={id} type="hidden" name="serviceIds" value={id} />
      ))}
      <input type="hidden" name="offsetMinutes" value={offset} />
      <input type="hidden" name="trigger" value={trigger} />

      <Card>
        <CardBody className="grid gap-5">
          <Field
            label="Nombre de la regla"
            name="name"
            required
            defaultValue={state.values?.name ?? rule?.name ?? ""}
            placeholder="Recordatorio del día anterior"
            hint="Sólo lo ves vos. Que se entienda de un vistazo cuál es cuál."
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Cuándo</CardTitle>

          <Select
            label="Qué lo dispara"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as Trigger)}
          >
            {(Object.keys(TRIGGER_LABELS) as Trigger[]).map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </Select>

          {usaMomento && (
            <div className="grid gap-2">
              <span className="text-[13.5px] font-medium">Cuánto</span>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => setOffset(Math.abs(p.minutes))}
                    aria-pressed={offset === Math.abs(p.minutes)}
                    className={`rounded-pill border-[1.5px] px-3.5 py-1.5 text-[13px] font-medium ${
                      offset === Math.abs(p.minutes)
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  step={15}
                  value={offset}
                  onChange={(e) => setOffset(Math.abs(Number(e.target.value)))}
                  aria-label="Minutos"
                  className="h-11 w-32 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
                />
                <span className="text-[13.5px] text-muted">
                  minutos · {describeOffset(
                    trigger === "before_appointment" ? -offset : offset,
                  )}
                </span>
              </div>
              <p className="text-[12.5px] leading-snug text-muted">
                No hay tope: podés recordar un turno con quince días de
                anticipación si querés.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Por dónde</CardTitle>
          <p className="-mt-3 text-[13.5px] leading-relaxed text-muted">
            Se intenta en este orden y se usa el primero que la persona tenga.
            Las notificaciones y el correo no cuestan nada; cada WhatsApp sí.
          </p>

          <ul className="grid gap-1.5">
            {canalesOfrecidos(correoDisponible).map((ch) => {
              const activo = channels.includes(ch);
              const orden = channels.indexOf(ch) + 1;

              return (
                <li
                  key={ch}
                  className={`flex items-center gap-3 rounded-[16px] border-[1.5px] px-3.5 py-2.5 ${
                    activo ? "border-accent bg-accent-wash" : "border-line bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setChannels(
                        activo
                          ? channels.filter((c) => c !== ch)
                          : [...channels, ch],
                      )
                    }
                    aria-pressed={activo}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                    <span className="text-[14.5px] font-medium">
                      {CHANNEL_LABELS[ch]}
                    </span>
                    <span className="text-[12.5px] text-muted">
                      {ch === "whatsapp" ? "con costo" : "gratis"}
                    </span>
                  </button>

                  {activo && (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => moverCanal(ch, -1)}
                        aria-label={`Subir ${CHANNEL_LABELS[ch]}`}
                        className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-line bg-surface text-[12px]"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moverCanal(ch, 1)}
                        aria-label={`Bajar ${CHANNEL_LABELS[ch]}`}
                        className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-line bg-surface text-[12px]"
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="grid gap-4">
            {channels.map((ch) => {
              const delCanal = templates.filter(
                (t) => t.channel === ch && t.is_active,
              );
              const actual = rule?.rule_templates?.find(
                (rt) => rt.channel === ch,
              )?.template_id;

              return (
                <Select
                  key={ch}
                  label={`Mensaje por ${CHANNEL_LABELS[ch].toLowerCase()}`}
                  name={`template_${ch}`}
                  defaultValue={actual ?? ""}
                  hint={
                    delCanal.length === 0
                      ? "Todavía no tenés plantillas para este canal."
                      : undefined
                  }
                >
                  <option value="">Sin mensaje para este canal</option>
                  {delCanal.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>A quiénes</CardTitle>

          {services.length > 0 && (
            <div className="grid gap-2">
              <span className="text-[13.5px] font-medium">Servicios</span>
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => {
                  const activo = serviceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={activo}
                      onClick={() =>
                        setServiceIds(
                          activo
                            ? serviceIds.filter((x) => x !== s.id)
                            : [...serviceIds, s.id],
                        )
                      }
                      className={`rounded-pill border-[1.5px] px-3 py-1.5 text-[12.5px] font-medium ${
                        activo
                          ? "border-accent bg-accent text-on-accent"
                          : "border-line bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12.5px] text-muted">
                Sin ninguno marcado, la regla vale para todos los servicios.
              </p>
            </div>
          )}

          <Toggle
            name="onlyIfMissed"
            label="Sólo a quien alguna vez faltó"
            hint="Un cliente con cien turnos y cero faltas no necesita tres avisos. Es la palanca que más ahorra."
            defaultChecked={onlyIfMissed}
            onChange={setOnlyIfMissed}
          />
        </CardBody>
      </Card>

      {/* El simulador. Lo que convierte "activar una regla" en una decisión
          informada en vez de una apuesta. */}
      <Card accent>
        <CardBody className="grid gap-3">
          <CardTitle>Si la activás hoy</CardTitle>

          {channels.length === 0 ? (
            <p className="text-[14.5px] opacity-85">
              Elegí al menos un canal para ver el alcance.
            </p>
          ) : (
            <>
              <p className="font-hand text-[40px] leading-none">
                {simulando ? "calculando…" : `${alcanzados} personas`}
              </p>

              <ul className="grid gap-1 text-[14px]">
                {visible
                  .filter((s) => s.channel !== null)
                  .map((s) => (
                    <li key={s.channel} className="flex justify-between gap-3">
                      <span>
                        {s.recipients} por {CHANNEL_LABELS[s.channel as Channel]}
                      </span>
                      <span className="tabular-nums opacity-85">
                        {s.cost_cents === 0 ? "gratis" : formatPrice(s.cost_cents)}
                      </span>
                    </li>
                  ))}
              </ul>

              <p className="border-t border-white/25 pt-2 text-[15px] font-semibold">
                Costo estimado: {costo === 0 ? "$ 0" : formatPrice(costo)}
              </p>

              {sinCanal > 0 && (
                <p className="text-[13px] leading-snug opacity-85">
                  Hay {sinCanal} {sinCanal === 1 ? "persona" : "personas"} sin
                  forma de contacto: no van a recibir nada hasta que les cargues
                  un teléfono o un correo.
                </p>
              )}

              <p className="text-[12.5px] leading-snug opacity-75">
                Calculado sobre los turnos de los próximos 30 días. Es una
                estimación: el costo real depende de quién confirme por dónde.
              </p>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Toggle
            name="enabled"
            label="Activar la regla"
            hint="Apagada no envía nada. Podés dejarla armada y prenderla cuando quieras."
            defaultChecked={rule?.enabled ?? false}
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
          <Link href="/recordatorios">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
