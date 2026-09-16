"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import {
  crearPlantillasEnMeta,
  revisarWhatsapp,
  type RevisionState,
} from "@/lib/actions/whatsapp";

const INICIAL: RevisionState = { error: null };

function Revisar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Preguntándole a Meta…" : "Revisar la conexión"}
    </Button>
  );
}

/**
 * Revisar la conexión antes de confiarle un cliente.
 *
 * Los cinco pasos de Meta terminan sin que nadie te diga si quedaron bien, y
 * lo peor de un recordatorio que no sale es que nadie se entera de que no
 * salió. Esto pregunta las tres cosas que se rompen, en el orden en que se
 * rompen: si el token sirve, si las plantillas están con el nombre exacto, y
 * si un mensaje llega de verdad.
 */
export function RevisionWhatsapp() {
  const [state, action] = useActionState(revisarWhatsapp, INICIAL);
  const [creando, empezarCreacion] = useTransition();
  const [creacion, setCreacion] = useState<RevisionState | null>(null);

  const mostrar = creacion ?? state;

  return (
    <Card>
      <CardBody className="grid gap-4">
        <CardTitle>Revisar la conexión</CardTitle>

        <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
          Le pregunta a Meta si quedó todo bien, sin esperar a que un cliente se
          quede sin su recordatorio. Si ponés un teléfono, además le manda un
          mensaje de prueba.
        </p>

        <form action={action} className="grid gap-4">
          <Field
            label="Mandar una prueba a este teléfono"
            name="destino"
            inputMode="tel"
            defaultValue={state.values?.destino ?? ""}
            placeholder="+54 9 358 412 3456"
            hint="Opcional. Poné el tuyo. Con el número de prueba de Meta sólo funcionan los que hayas verificado ahí."
          />

          {state.error && (
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {state.error}
            </p>
          )}

          <div className="flex">
            <Revisar />
          </div>
        </form>

        <div className="grid gap-2 border-t-[1.5px] border-line pt-4">
          <p className="text-[13.5px] font-medium">Las plantillas, en Meta</p>
          <p className="max-w-prose text-[13px] leading-relaxed text-muted">
            En vez de cargarlas a mano en WhatsApp Manager, las crea acá con el
            nombre y el texto exactos que el emisor espera. Es el paso del alta
            que más se rompe: un guión de más y Meta aprueba una plantilla que
            después no encuentra nadie.
          </p>
          <div className="flex">
            <Button
              type="button"
              variant="outline"
              disabled={creando}
              onClick={() =>
                empezarCreacion(async () => {
                  setCreacion(await crearPlantillasEnMeta());
                })
              }
            >
              {creando ? "Creándolas en Meta…" : "Crear las plantillas en Meta"}
            </Button>
          </div>
        </div>

        {mostrar.error && creacion && (
          <p
            role="alert"
            className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
          >
            {mostrar.error}
          </p>
        )}

        {mostrar.pasos && mostrar.pasos.length > 0 && (
          <ul className="grid gap-2 border-t-[1.5px] border-line pt-4">
            {mostrar.pasos.map((p) => (
              <li
                key={p.clave}
                className={`grid gap-1 rounded-[14px] px-3.5 py-3 ${
                  p.ok ? "bg-ok-wash" : "bg-danger-wash"
                }`}
              >
                <p
                  className={`text-[13.5px] font-semibold ${
                    p.ok ? "text-ok" : "text-danger"
                  }`}
                >
                  {p.ok ? "✓" : "✗"} {p.titulo}
                </p>
                <p className="text-[13px] leading-snug text-ink">{p.detalle}</p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
