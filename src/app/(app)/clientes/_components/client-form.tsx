"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { normalizePhone } from "@/lib/phone";
import type { FormState } from "@/lib/actions/clients";
import type { Client } from "@/lib/data/clients";

const INITIAL: FormState = { error: null };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

export function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  client?: Client;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  const sent = state.values;
  const text = (key: string, fallback: string) => sent?.[key] ?? fallback;

  const [phoneRaw, setPhoneRaw] = useState(
    text("phoneRaw", client?.phone_raw ?? ""),
  );
  const [isLandline, setIsLandline] = useState(
    sent ? sent.isLandline === "on" : false,
  );

  // Vista previa en vivo: se ve cómo va a quedar guardado el número antes de
  // apretar nada. Es donde se detecta el error de tipeo, no después.
  const preview = phoneRaw
    ? normalizePhone(phoneRaw, { isMobile: !isLandline })
    : null;

  return (
    <form action={formAction} className="grid gap-4">
      <Card>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Nombre"
            name="firstName"
            required
            autoFocus={!client}
            defaultValue={text("firstName", client?.first_name ?? "")}
            placeholder="Mirián"
          />
          <Field
            label="Apellido"
            name="lastName"
            defaultValue={text("lastName", client?.last_name ?? "")}
            placeholder="Ortiz"
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Cómo la contactamos</CardTitle>

          <div className="grid gap-3">
            <Field
              label="Teléfono"
              name="phoneRaw"
              type="tel"
              inputMode="tel"
              value={phoneRaw}
              onChange={(e) => setPhoneRaw(e.target.value)}
              placeholder="0358 15 412-3456"
              hint="Escribilo como quieras: con característica, con 15, con guiones."
            />

            {preview?.e164 && (
              <p className="rounded-[14px] bg-accent-wash px-3.5 py-2.5 text-[13px] text-accent-text">
                Se va a guardar como <strong>{preview.display}</strong>
                {preview.assumedMobile && (
                  <>
                    {" "}
                    — lo tomamos como celular. Si es un fijo, marcalo abajo.
                  </>
                )}
              </p>
            )}
            {preview?.error && (
              <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] text-warn">
                {preview.error}
              </p>
            )}

            <Toggle
              name="isLandline"
              label="Es un teléfono fijo"
              hint="Los fijos no reciben WhatsApp. Dejalo apagado si es un celular."
              defaultChecked={isLandline}
              onChange={setIsLandline}
            />
          </div>

          <Field
            label="Correo"
            name="email"
            type="email"
            inputMode="email"
            defaultValue={text("email", client?.email ?? "")}
            placeholder="mirian@ejemplo.com"
            hint="Los recordatorios por correo no cuestan nada, así que conviene tenerlo."
          />

          <Select
            label="Por dónde le avisamos"
            name="channelMode"
            defaultValue={text("channelMode", client?.channel_mode ?? "auto")}
            hint="Automático elige el canal más barato que tenga disponible. Elegí uno fijo si sabés que no mira el correo, o que prefiere WhatsApp."
          >
            <option value="auto">Automático (recomendado)</option>
            <option value="email">Siempre por correo</option>
            <option value="whatsapp">Siempre por WhatsApp</option>
            <option value="none">No recibe recordatorios</option>
          </Select>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <CardTitle>Datos y advertencias</CardTitle>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Documento"
              name="documentId"
              defaultValue={text("documentId", client?.document_id ?? "")}
              placeholder="30123456"
            />
            <Field
              label="Cumpleaños"
              name="birthdate"
              type="date"
              defaultValue={text("birthdate", client?.birthdate ?? "")}
              hint="Para poder saludarla ese día."
            />
          </div>

          <Textarea
            label="Aviso importante"
            name="alert"
            maxLength={300}
            defaultValue={text("alert", client?.alert ?? "")}
            placeholder="Alérgica a la lidocaína. Embarazada."
            hint="Se muestra siempre, arriba de todo y al agendar. Usalo sólo para lo que no se puede pasar por alto; el resto va en las notas."
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
          <Link href={client ? `/clientes/${client.id}` : "/clientes"}>
            Cancelar
          </Link>
        </Button>
      </div>
    </form>
  );
}
