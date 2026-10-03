"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import {
  requestPasswordReset,
  signIn,
  signUp,
  type FormState,
} from "@/lib/actions/auth";

const INITIAL: FormState = { error: null };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Un momento…" : label}
    </Button>
  );
}

type Modo = "in" | "up" | "reset";

/**
 * Una sola acción para las tres cosas, que decide por el campo `modo`.
 *
 * Antes se le pasaba a `useActionState` una acción distinta según la pestaña,
 * pero React se queda con la del primer envío: quien creaba la cuenta, tocaba
 * «Ya tengo cuenta» e intentaba entrar, seguía mandando al alta, que le
 * reclamaba un nombre que ya no estaba en pantalla con un error de validación
 * en inglés. Es justo el camino de quien acaba de registrarse y no encuentra
 * el mail. Con una acción fija, lo que viaja en el formulario es lo que manda.
 */
async function enviar(prev: FormState, formData: FormData): Promise<FormState> {
  const modo = formData.get("modo");
  if (modo === "reset") return requestPasswordReset(prev, formData);
  if (modo === "up") return signUp(prev, formData);
  return signIn(prev, formData);
}

export function AuthForm({
  volver,
  enlaceVencido,
  correoConfirmado,
}: {
  volver?: string;
  enlaceVencido?: boolean;
  correoConfirmado?: boolean;
}) {
  const [mode, setMode] = useState<Modo>("in");
  const isSignUp = mode === "up";
  const isReset = mode === "reset";

  const [state, action] = useActionState(enviar, INITIAL);

  return (
    <Card>
      <CardBody className="grid gap-5">
        {/* Selector en píldora: mismo lenguaje que la navegación. Recuperar la
            contraseña no es una tercera pestaña: es un desvío de entrar, y
            ponerlo arriba le daría el mismo peso que crear una cuenta. */}
        {!isReset && (
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
        )}

        {isReset && (
          <p className="text-[14px] leading-relaxed text-muted">
            Poné el correo con el que entrás y te mandamos un enlace para poner
            una contraseña nueva.
          </p>
        )}

        {correoConfirmado && (
          <p
            role="status"
            className="rounded-[14px] bg-ok-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink"
          >
            Tu correo quedó confirmado. Entrá con el correo y la contraseña que
            elegiste al crear la cuenta.
          </p>
        )}

        {enlaceVencido && (
          <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
            Ese enlace venció o ya se usó. Pedí uno nuevo con «Olvidé mi
            contraseña».
          </p>
        )}

        <form action={action} className="grid gap-4">
          <input type="hidden" name="modo" value={mode} />
          {/* Adónde volver después de entrar. Lo pone el guardia cuando
              alguien llega a una pantalla que pide sesión. */}
          {volver && <input type="hidden" name="volver" value={volver} />}

          {isSignUp && (
            <Field
              label="Nombre y apellido"
              name="fullName"
              autoComplete="name"
              required
              placeholder="Ana Gómez"
            />
          )}

          <Field
            label="Correo"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="vos@tunegocio.com"
          />

          {!isReset && (
            <Field
              label="Contraseña"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={8}
              hint={isSignUp ? "Mínimo 8 caracteres." : undefined}
            />
          )}

          {state.error && (
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {state.error}
            </p>
          )}

          {state.notice && (
            <p className="rounded-[14px] bg-ok-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ok">
              {state.notice}
            </p>
          )}

          <Submit
            label={
              isReset
                ? "Mandame el enlace"
                : isSignUp
                  ? "Crear mi cuenta"
                  : "Entrar"
            }
          />
        </form>

        <button
          type="button"
          onClick={() => setMode(isReset ? "in" : "reset")}
          className="text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {isReset ? "Volver a entrar" : "Olvidé mi contraseña"}
        </button>
      </CardBody>
    </Card>
  );
}
