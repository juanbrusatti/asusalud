"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { abrirCaja, type FormState } from "@/lib/actions/caja";

const INITIAL: FormState = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Abriendo…" : "Abrir la caja"}
    </Button>
  );
}

export function AbrirCaja() {
  const [state, action] = useActionState(abrirCaja, INITIAL);

  return (
    <Card>
      <CardBody className="grid justify-items-start gap-4">
        <div className="grid gap-2">
          <p className="font-hand text-[38px] leading-none text-accent-text">
            Buen día
          </p>
          <CardTitle>La caja está cerrada</CardTitle>
          <p className="max-w-prose text-[14.5px] leading-relaxed text-muted">
            Abrila para empezar a registrar los cobros del día. Al cerrarla vas
            a ver cuánto debería haber y cuánto contaste.
          </p>
        </div>

        <form action={action} className="grid w-full max-w-xs gap-4">
          <Field
            label="Con cuánto arrancás"
            name="opening"
            inputMode="numeric"
            defaultValue={state.values?.opening ?? "0"}
            placeholder="10000"
            hint="El efectivo que ya hay en el cajón. Si arrancás sin nada, dejá 0."
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
