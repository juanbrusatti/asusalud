"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cerrarCaja, type CierreResult } from "@/lib/actions/caja";
import { formatPrice } from "@/lib/money";

const INITIAL: CierreResult = { error: null };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Cerrando…" : "Cerrar la caja"}
    </Button>
  );
}

/**
 * El cierre.
 *
 * A propósito NO se muestra cuánto debería haber antes de contar: si el número
 * está a la vista, el conteo deja de ser un conteo. Aparece recién después,
 * junto con la diferencia.
 */
export function CerrarCaja({ sessionId }: { sessionId: string }) {
  const action = cerrarCaja.bind(null, sessionId);
  const [state, formAction] = useActionState(action, INITIAL);
  const [abierto, setAbierto] = useState(false);

  if (state.arqueo) {
    const { expectedCents, countedCents, differenceCents } = state.arqueo;
    const cuadra = differenceCents === 0;

    return (
      <Card accent={cuadra}>
        <CardBody className="grid gap-3">
          <p className="font-hand text-[40px] leading-none">
            {cuadra ? "Cuadra" : "Cerrada"}
          </p>
          <CardTitle>Caja cerrada</CardTitle>

          <dl className="grid gap-1.5 text-[14.5px] tabular-nums">
            <div className="flex justify-between gap-3">
              <dt>Debería haber</dt>
              <dd>{formatPrice(expectedCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Contaste</dt>
              <dd>{formatPrice(countedCents)}</dd>
            </div>
            <div
              className={`flex justify-between gap-3 border-t pt-1.5 font-semibold ${
                cuadra ? "border-white/25" : "border-line"
              }`}
            >
              <dt>Diferencia</dt>
              <dd className={cuadra ? "" : differenceCents < 0 ? "text-danger" : "text-warn"}>
                {differenceCents > 0 ? "+" : ""}
                {formatPrice(differenceCents)}
              </dd>
            </div>
          </dl>

          {!cuadra && (
            <p className="text-[13px] leading-relaxed text-muted">
              {differenceCents < 0
                ? "Falta plata en el cajón. Suele ser un cobro que no se registró o un vuelto de más."
                : "Sobra plata en el cajón. Suele ser un cobro registrado de menos."}
            </p>
          )}
        </CardBody>
      </Card>
    );
  }

  if (!abierto) {
    return (
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setAbierto(true)}>
          Cerrar la caja
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardBody className="grid gap-4">
        <CardTitle>Cerrar la caja</CardTitle>
        <p className="-mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
          Contá el efectivo que hay en el cajón y poné el total. Recién después
          te mostramos cuánto debería haber: así el conteo sigue siendo un
          conteo.
        </p>

        <form action={formAction} className="grid gap-4">
          <Field
            label="Efectivo contado"
            name="counted"
            inputMode="numeric"
            required
            placeholder="16000"
            className="w-40"
          />

          <Textarea
            label="Observaciones"
            name="notes"
            maxLength={500}
            placeholder="Faltaron $200, capaz un vuelto mal dado."
            hint="Opcional. Si la caja no cuadra, conviene anotar qué pudo haber pasado."
          />

          {state.error && (
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {state.error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Submit />
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Todavía no
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
