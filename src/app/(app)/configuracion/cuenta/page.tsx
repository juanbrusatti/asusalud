import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardFigure, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { formatMes } from "@/lib/cuenta";
import { getCuenta } from "@/lib/data/cuenta";
import { formatPrice } from "@/lib/money";
import { Volver } from "../_components/volver";

export const metadata: Metadata = { title: "Tu cuenta" };

/**
 * Lo que el negocio lleva gastado en Dlay.
 *
 * Se muestra el detalle y no sólo el total a propósito. El mismo sistema que
 * cuenta los turnos es el que cobra por ellos, así que poder mirar la lista y
 * decir «este no lo atendí» no es un adorno: es lo que hace que el número se
 * pueda creer.
 */
export default async function CuentaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const cuenta = await getCuenta();
  if (!cuenta) notFound();

  const sinPagar = cuenta.meses.filter((m) => !m.pagado);
  const deuda = sinPagar.reduce((t, m) => t + m.total_cents, 0);

  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
      <div>
        <Volver />
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Tu cuenta
        </h1>
        <p className="mt-1 max-w-prose text-[14.5px] text-muted">
          Dlay se cobra por turno atendido: {formatPrice(cuenta.precio_cents)}{" "}
          por cada turno que ocurrió. Los cancelados y los que no vinieron no se
          cobran.
        </p>
      </div>

      <Card accent>
        <CardBody className="grid gap-2">
          <p className="text-[13px] uppercase tracking-wider opacity-75">
            {formatMes(cuenta.mes_actual.periodo)}, hasta hoy
          </p>
          <CardFigure>{formatPrice(cuenta.mes_actual.total_cents)}</CardFigure>
          <p className="text-[14px] opacity-90">
            {cuenta.mes_actual.cantidad === 0
              ? "Todavía no hubo turnos este mes."
              : `${cuenta.mes_actual.cantidad} ${
                  cuenta.mes_actual.cantidad === 1 ? "turno" : "turnos"
                } × ${formatPrice(cuenta.precio_cents)}`}
          </p>
          <p className="border-t-[1.5px] border-white/25 pt-3 text-[13px] leading-relaxed opacity-75">
            El mes todavía no cerró, así que este número va a seguir subiendo.
            Se cobra cuando termina.
          </p>
        </CardBody>
      </Card>

      {deuda > 0 && (
        <Card>
          <CardBody className="grid gap-2">
            <CardTitle>Pendiente de pago</CardTitle>
            <p className="font-hand text-[34px] leading-none text-accent-text">
              {formatPrice(deuda)}
            </p>
            <p className="text-[13.5px] leading-relaxed text-muted">
              {sinPagar.length === 1
                ? "Corresponde al mes cerrado que todavía no figura pagado."
                : `Corresponde a ${sinPagar.length} meses cerrados que todavía no figuran pagados.`}{" "}
              Te vamos a avisar cuando haya que abonarlo.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>Meses cerrados</CardTitle>

          {cuenta.meses.length === 0 ? (
            <p className="text-[13.5px] leading-relaxed text-muted">
              Todavía no cerró ningún mes. Cuando termine el actual va a
              aparecer acá con su detalle.
            </p>
          ) : (
            <ul className="grid gap-1">
              {cuenta.meses.map((m) => (
                <li
                  key={m.periodo}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-[1.5px] border-line-soft py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium">
                      {formatMes(m.periodo)}
                    </p>
                    <p className="text-[13px] text-muted">
                      {m.cantidad} {m.cantidad === 1 ? "turno" : "turnos"}
                    </p>
                  </div>

                  <p className="text-[14.5px] tabular-nums">
                    {formatPrice(m.total_cents)}
                  </p>

                  <span
                    className={`rounded-pill px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider ${
                      m.pagado
                        ? "bg-ok-wash text-ok"
                        : "bg-warn-wash text-warn"
                    }`}
                  >
                    {m.pagado ? "Pagado" : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="px-1 text-[12.5px] leading-relaxed text-faint">
        Los mensajes de WhatsApp no están incluidos acá: los cobra Meta
        directamente contra la tarjeta que cargaste en tu cuenta de WhatsApp, y
        los ves en su propio resumen.
      </p>
    </main>
  );
}
