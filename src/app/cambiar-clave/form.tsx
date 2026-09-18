"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { updatePassword, type FormState } from "@/lib/actions/auth";

const INICIAL: FormState = { error: null };

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Guardando…" : "Guardar la contraseña"}
    </Button>
  );
}

export function FormClave() {
  const [state, action] = useActionState(updatePassword, INICIAL);

  return (
    <Card>
      <CardBody>
        <form action={action} className="grid gap-4">
          <Field
            label="Contraseña nueva"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="Mínimo 8 caracteres."
          />

          <Field
            label="Repetila"
            name="repeat"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />

          {state.error && (
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {state.error}
            </p>
          )}

          <Guardar />
        </form>
      </CardBody>
    </Card>
  );
}
