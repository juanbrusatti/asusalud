"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { registrarMovimiento, type FormState } from "@/lib/actions/caja";
import { METHODS, METHOD_LABELS, type PaymentMethod } from "@/lib/caja";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/money";

const INITIAL: FormState = { error: null };

export type CobroMovimiento = {
  id: string;
  kind: "income" | "expense";
  method: PaymentMethod;
  amountCents: number;
  concept: string;
  createdAt: string;
  esAnulacion: boolean;
};

function Submit({
  cents,
  bloqueado,
}: {
  cents: number | null;
  bloqueado: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || bloqueado}>
      {pending
        ? "Registrando…"
        : cents && cents > 0
          ? `Cobrar ${formatPrice(cents)}`
          : "Registrar cobro"}
    </Button>
  );
}

/**
 * El formulario en sí, separado para poder remontarlo con `key`: cuando lo
 * cobrado cambia, vuelve a nacer con el saldo nuevo cargado. Si en cambio la
 * acción falla, lo cobrado no cambió, no se remonta y lo que la persona había
 * escrito sigue ahí.
 */
function Formulario({
  appointmentId,
  clientId,
  saldoCents,
  conceptoSugerido,
  cajaAbierta,
}: {
  appointmentId: string;
  clientId: string | null;
  saldoCents: number | null;
  conceptoSugerido: string;
  cajaAbierta: boolean;
}) {
  const [state, action] = useActionState(registrarMovimiento, INITIAL);
  const [importe, setImporte] = useState(
    saldoCents !== null && saldoCents > 0 ? centsToInput(saldoCents) : "",
  );
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [concepto, setConcepto] = useState(conceptoSugerido);

  const cents = parsePriceToCents(importe);
  const esSeña = cents !== null && saldoCents !== null && cents < saldoCents;
  const faltaCaja = method === "cash" && !cajaAbierta;

  return (
    <form action={action} className="grid gap-4 border-t-[1.5px] border-line pt-4">
      <input type="hidden" name="kind" value="income" />
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {clientId && <input type="hidden" name="clientId" value={clientId} />}

      <Field
        label="Importe"
        name="amount"
        inputMode="numeric"
        required
        className="w-40"
        value={importe}
        onChange={(e) => setImporte(e.target.value)}
        hint={
          saldoCents !== null && saldoCents > 0
            ? esSeña
              ? `Queda un saldo de ${formatPrice(saldoCents - (cents ?? 0))}.`
              : "Si deja una seña, cambialo por lo que entrega."
            : undefined
        }
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
            Queda registrado, pero no entra en el arqueo: no está en el cajón.
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
        hint="Es lo que vas a ver en la caja."
      />

      {faltaCaja && (
        <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] leading-snug text-ink">
          No hay una caja abierta, así que el efectivo todavía no se puede
          registrar.{" "}
          <Link href="/caja" className="font-medium underline">
            Abrir la caja
          </Link>
        </p>
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
        {/* Sin caja abierta el efectivo no tiene dónde caer. El botón queda
            apagado en vez de dejar que el intento termine en un error: el
            aviso de arriba ya dice por qué y cómo resolverlo. */}
        <Submit cents={cents} bloqueado={faltaCaja} />
      </div>
    </form>
  );
}

/**
 * Cobrar sin salir del turno.
 *
 * Todo lo que la caja pregunta —cuánto, a quién, por qué— ya está en esta
 * pantalla, así que viene cargado y el cobro es un toque. El importe queda
 * editable porque las señas y los pagos en dos veces son lo normal, no la
 * excepción.
 */
export function Cobro({
  appointmentId,
  clientId,
  totalCents,
  paidCents,
  conceptoSugerido,
  movimientos,
  cajaAbierta,
  timeZone,
}: {
  appointmentId: string;
  clientId: string | null;
  totalCents: number | null;
  paidCents: number;
  conceptoSugerido: string;
  movimientos: CobroMovimiento[];
  cajaAbierta: boolean;
  timeZone: string;
}) {
  const [abierto, setAbierto] = useState(false);

  // Sin precio no hay saldo que calcular: el turno se cobra a mano.
  const saldoCents = totalCents === null ? null : totalCents - paidCents;
  const saldado = saldoCents !== null && saldoCents <= 0;
  const mostrarFormulario = !saldado || abierto;

  const hora = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card>
      <CardBody className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Cobro</CardTitle>
          {saldado && (
            <span className="rounded-pill bg-accent px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-on-accent">
              {saldoCents === 0 ? "Cobrado" : "A favor del cliente"}
            </span>
          )}
        </div>

        {totalCents !== null ? (
          <dl className="grid gap-1.5 text-[14.5px] tabular-nums">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total del turno</dt>
              <dd>{formatPrice(totalCents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Cobrado</dt>
              <dd>{formatPrice(paidCents)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t-[1.5px] border-line pt-1.5 font-semibold">
              <dt>
                {saldoCents !== null && saldoCents < 0 ? "A devolver" : "Saldo"}
              </dt>
              <dd className={saldado ? "text-accent-text" : ""}>
                {formatPrice(Math.abs(saldoCents ?? 0))}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-[13px] leading-snug text-muted">
            Este turno es a convenir, así que no hay saldo que calcular: poné
            vos cuánto se cobra.
          </p>
        )}

        {movimientos.length > 0 && (
          <ul className="grid gap-1.5">
            {movimientos.map((m) => (
              <li
                key={m.id}
                className="flex items-baseline justify-between gap-3 text-[13.5px]"
              >
                <span className="min-w-0 text-muted">
                  {hora.format(new Date(m.createdAt))} ·{" "}
                  {METHOD_LABELS[m.method]}
                  {m.esAnulacion && " · anulación"}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    m.kind === "expense" ? "text-danger" : ""
                  }`}
                >
                  {m.kind === "expense" ? "−" : ""}
                  {formatPrice(m.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {mostrarFormulario ? (
          <Formulario
            key={paidCents}
            appointmentId={appointmentId}
            clientId={clientId}
            saldoCents={saldoCents}
            conceptoSugerido={conceptoSugerido}
            cajaAbierta={cajaAbierta}
          />
        ) : (
          <div className="flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAbierto(true)}
            >
              Registrar otro cobro
            </Button>
          </div>
        )}

        {saldado && (
          <p className="text-[12.5px] leading-snug text-muted">
            Los cobros se corrigen desde la caja: se anulan, no se borran.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
