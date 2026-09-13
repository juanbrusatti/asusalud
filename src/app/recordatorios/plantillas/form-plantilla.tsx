"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveTemplate, type FormState } from "@/lib/actions/recordatorios";
import { CHANNEL_LABELS, type Channel, type Template } from "@/lib/recordatorios";

const INITIAL: FormState = { error: null };

/** Lo que el sistema reemplaza al enviar. */
const VARIABLES = [
  ["{{cliente}}", "el nombre de la clienta"],
  ["{{fecha}}", "la fecha del turno"],
  ["{{hora}}", "la hora del turno"],
  ["{{servicio}}", "qué se le hace"],
  ["{{estetica}}", "el nombre de tu estética"],
  ["{{link}}", "el enlace donde puede mover o cancelar el turno"],
] as const;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function FormPlantilla({
  template,
  submitLabel,
}: {
  template?: Template;
  submitLabel: string;
}) {
  const action = saveTemplate.bind(null, template?.id ?? null);
  const [state, formAction] = useActionState(action, INITIAL);
  const [channel, setChannel] = useState<Channel>(template?.channel ?? "email");
  const [body, setBody] = useState(template?.body ?? "");
  const [botones, setBotones] = useState<string[]>(template?.quick_replies ?? []);

  const sent = state.values;

  const vistaPrevia = body
    .replaceAll("{{cliente}}", "Mirián")
    .replaceAll("{{fecha}}", "lunes 14 de septiembre")
    .replaceAll("{{hora}}", "09:00")
    .replaceAll("{{servicio}}", "depilación definitiva")
    .replaceAll("{{estetica}}", "Estética Asusalud")
    .replaceAll("{{link}}", "dlay.app/t/a1b2c3…");

  return (
    <form action={formAction} className="grid gap-4">
      <Card>
        <CardBody className="grid gap-5">
          <Field
            label="Nombre"
            name="name"
            required
            defaultValue={sent?.name ?? template?.name ?? ""}
            placeholder="Recordatorio del día anterior"
            hint="Sólo lo ves vos, para elegirlo después en las reglas."
          />

          <Select
            label="Canal"
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            hint="Cada canal necesita su propio mensaje: lo que sirve en un correo no sirve en un WhatsApp."
          >
            {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>

          {channel === "whatsapp" ? (
            <>
              <Field
                label="Nombre en Meta"
                name="providerName"
                required
                defaultValue={sent?.providerName ?? template?.provider_name ?? ""}
                placeholder="recordatorio_turno"
                hint="El nombre exacto con el que aprobaste la plantilla en WhatsApp Manager. Sin eso, Meta rechaza el envío."
              />
              <Select
                label="Categoría"
                name="category"
                defaultValue={sent?.category ?? template?.category ?? "utility"}
                hint="Utilidad es para recordatorios y confirmaciones: $37,68. Marketing es para promociones, sale $89,56 y necesita consentimiento."
              >
                <option value="utility">Utilidad</option>
                <option value="marketing">Marketing</option>
              </Select>
            </>
          ) : (
            <input type="hidden" name="category" value="utility" />
          )}

          {channel === "whatsapp" && (
            <div className="grid gap-2">
              {botones.map((b) => (
                <input key={b} type="hidden" name="quickReplies" value={b} />
              ))}
              <span className="text-[13.5px] font-medium">Botones</span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["confirmar", "Confirmar turno"],
                    ["reprogramar", "Quiero reprogramar"],
                    ["baja", "No me escriban más"],
                  ] as const
                ).map(([valor, etiqueta]) => {
                  const activo = botones.includes(valor);
                  return (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={activo}
                      onClick={() =>
                        setBotones(
                          activo
                            ? botones.filter((b) => b !== valor)
                            : [...botones, valor],
                        )
                      }
                      className={`rounded-pill border-[1.5px] px-3 py-1.5 text-[12.5px] font-medium ${
                        activo
                          ? "border-accent bg-accent text-on-accent"
                          : "border-line bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {etiqueta}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12.5px] leading-snug text-muted">
                Tienen que estar cargados en Meta con el mismo orden. Cuando la
                clienta toca &ldquo;Confirmar turno&rdquo;, la agenda se
                actualiza sola: es un mensaje menos que alguien tiene que leer y
                ejecutar a mano.
              </p>
            </div>
          )}

          {channel === "email" && (
            <Field
              label="Asunto"
              name="subject"
              defaultValue={sent?.subject ?? template?.subject ?? ""}
              placeholder="Tu turno en {{estetica}}"
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>El mensaje</CardTitle>

          <Textarea
            label="Texto"
            name="body"
            required
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hola {{cliente}}, te esperamos el {{fecha}} a las {{hora}} para tu {{servicio}}."
          />

          <div className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-muted">
              Tocá para insertar:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map(([token, que]) => (
                <button
                  key={token}
                  type="button"
                  title={que}
                  onClick={() => setBody((b) => `${b}${token}`)}
                  className="rounded-pill border-[1.5px] border-line bg-surface px-2.5 py-1 font-mono text-[11.5px] text-accent-text hover:border-accent"
                >
                  {token}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] leading-snug text-muted">
              Se reemplazan por los datos reales de cada clienta al enviar.
            </p>
          </div>

          {body && (
            <div className="rounded-[16px] bg-surface-2 px-4 py-3">
              <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-faint">
                Así lo va a recibir
              </p>
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">
                {vistaPrevia}
              </p>
            </div>
          )}
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
          <Link href="/recordatorios/plantillas">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
