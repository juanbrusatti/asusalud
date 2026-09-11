"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { createTenant, type FormState } from "@/lib/actions/tenant";

const INITIAL: FormState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Creando…" : "Crear mi estética"}
    </Button>
  );
}

/**
 * Primer paso de quien entra sin ninguna estética. Se pide un solo dato: el
 * nombre. Todo lo demás (dirección, horarios, servicios) se completa después,
 * cuando ya hay algo que mirar.
 */
export function CrearEstetica() {
  const [state, action] = useActionState(createTenant, INITIAL);

  return (
    <Card className="max-w-lg">
      <CardBody className="grid gap-5">
        <div className="grid gap-2">
          <p className="font-hand text-[38px] leading-none text-accent-text">
            Empecemos
          </p>
          <CardTitle>¿Cómo se llama tu estética?</CardTitle>
          <p className="text-[14.5px] leading-relaxed text-muted">
            Es el nombre que van a ver tus clientas cuando reserven un turno.
            Después se puede cambiar.
          </p>
        </div>

        <form action={action} className="grid gap-4">
          <Field
            label="Nombre"
            name="name"
            required
            minLength={2}
            autoFocus
            placeholder="Estética Asusalud"
            hint="Con tu nombre alcanza si trabajás por tu cuenta."
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
            <Submit />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
