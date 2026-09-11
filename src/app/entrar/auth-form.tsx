"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { signIn, signUp, type FormState } from "@/lib/actions/auth";

const INITIAL: FormState = { error: null };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Un momento…" : label}
    </Button>
  );
}

export function AuthForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const isSignUp = mode === "up";

  const [state, action] = useActionState(
    isSignUp ? signUp : signIn,
    INITIAL,
  );

  return (
    <Card>
      <CardBody className="grid gap-5">
        {/* Selector en píldora: mismo lenguaje que la navegación. */}
        <div
          role="tablist"
          aria-label="Entrar o crear cuenta"
          className="flex gap-1 rounded-pill border-[1.5px] border-line bg-surface-2 p-1"
        >
          {(
            [
              ["in", "Ya tengo cuenta"],
              ["up", "Crear cuenta"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`flex-1 rounded-pill px-3 py-2 text-[13.5px] font-medium ${
                mode === value
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form action={action} className="grid gap-4">
          {isSignUp && (
            <Field
              label="Nombre y apellido"
              name="fullName"
              autoComplete="name"
              required
              placeholder="Jesica Morlhiere"
            />
          )}

          <Field
            label="Correo"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="vos@tuestetica.com"
          />

          <Field
            label="Contraseña"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            minLength={8}
            hint={isSignUp ? "Mínimo 8 caracteres." : undefined}
          />

          {state.error && (
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {state.error}
            </p>
          )}

          <Submit label={isSignUp ? "Crear mi cuenta" : "Entrar"} />
        </form>
      </CardBody>
    </Card>
  );
}
