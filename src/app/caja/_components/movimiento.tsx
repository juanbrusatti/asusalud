"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { registrarMovimiento, type FormState } from "@/lib/actions/caja";
import { EXPENSE_PRESETS, METHODS, METHOD_LABELS } from "@/lib/caja";

const INITIAL: FormState = { error: null };

function Submit({ kind }: { kind: "income" | "expense" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending
        ? "Registrando…"
        : kind === "income"
          ? "Registrar cobro"
          : "Registrar gasto"}
    </Button>
  );
}

/**
 * Cobrar o registrar un gasto.
 *
 * Es lo que más se usa en el día, así que va arriba de todo y con el medio de
 * pago a un toque: el efectivo viene elegido porque es el caso común.
 */
export function Movimiento() {
  const [state, action] = useActionState(registrarMovimiento, INITIAL);
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [method, setMethod] = useState("cash");
  const [concepto, setConcepto] = useState("");
  const form = useRef<HTMLFormElement>(null);

  return (
    <Card>
      <CardBody className="grid gap-4">
        <CardTitle>Registrar</CardTitle>

        <div className="flex gap-1 rounded-pill border-[1.5px] border-line bg-surface-2 p-1">
          {(
            [
              ["income", "Cobro"],
              ["expense", "Gasto"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={kind === valor}
              onClick={() => setKind(valor)}
              className={`flex-1 rounded-pill px-3 py-2 text-[13.5px] font-medium ${
                kind === valor
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:text-ink"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <form ref={form} action={action} className="grid gap-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="method" value={method} />

          <Field
            label="Importe"
            name="amount"
            inputMode="numeric"
            required
            placeholder="3500"
            className="w-40"
          />

          <div className="grid gap-2">
            <span className="text-[13.5px] font-medium">Medio de pago</span>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  onClick={() => setMethod(m)}
                  className={`rounded-pill border-[1.5px] px-3 py-1.5 text-[12.5px] font-medium ${
                    method === m
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            {method !== "cash" && (
              <p className="text-[12.5px] leading-snug text-muted">
                Lo que no es efectivo queda registrado pero no entra en el
                arqueo: no está en el cajón.
              </p>
            )}
          </div>

          <Field
            label="Concepto"
            name="concept"
            required
            minLength={2}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder={kind === "income" ? "Masaje de Mirián" : "Compra de algodón"}
          />

          {kind === "expense" && (
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setConcepto(p)}
                  className="rounded-pill border-[1.5px] border-line bg-surface px-3 py-1 text-[12px] text-muted hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {state.error && (
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {state.error}
            </p>
          )}

          <div className="flex">
            <Submit kind={kind} />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
