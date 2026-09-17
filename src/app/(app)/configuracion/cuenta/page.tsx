import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardFigure, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { formatComision, formatMes } from "@/lib/cuenta";
import { getCuenta } from "@/lib/data/cuenta";
import { formatPrice } from "@/lib/money";
import { Volver } from "../_components/volver";

export const metadata: Metadata = { title: "Tu cuenta" };

/**
 * Lo que el negocio lleva gastado en Dlay.
 *
 * Se muestra la base y no sólo la comisión a propósito. El mismo sistema que
 * cuenta lo facturado es el que cobra sobre eso, así que poder mirar de dónde
 * sale el número no es un adorno: es lo que hace que se pueda creer.
 */
export default async function CuentaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const cuenta = await getCuenta();
  if (!cuenta) notFound();

  const porcentaje = formatComision(cuenta.comision_bps);
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
          Dlay se cobra el {porcentaje} de lo que facturás. Un turno de $ 1.000
          paga {porcentaje} de eso y uno de $ 20.000 también: siempre la misma
          proporción. Los cancelados y los que no vinieron no cuentan.
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
              : `${porcentaje} de ${formatPrice(
                  cuenta.mes_actual.base_cents,
                )} facturados en ${cuenta.mes_actual.cantidad} ${
                  cuenta.mes_actual.cantidad === 1 ? "turno" : "turnos"
                }`}
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
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b-[1.5px] border-line-soft py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium">
                      {formatMes(m.periodo)}
                    </p>
                    <p className="text-[13px] text-muted">
                      {m.cantidad} {m.cantidad === 1 ? "turno" : "turnos"} ·{" "}
                      {formatPrice(m.base_cents)} facturados
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[14.5px] tabular-nums">
                      {formatPrice(m.total_cents)}
                    </p>
                    <p className="text-[12px] text-faint tabular-nums">
                      {formatComision(m.comision_bps)}
                    </p>
                  </div>

                  <span
                    className={`rounded-pill px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider ${
                      m.pagado ? "bg-ok-wash text-ok" : "bg-warn-wash text-warn"
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
        Los servicios con precio «a convenir» no suman a lo facturado, porque
        el sistema no sabe cuánto salieron. Los mensajes de WhatsApp tampoco
        están acá: los cobra Meta directamente contra la tarjeta que cargaste
        en tu cuenta de WhatsApp.
      </p>
    </main>
  );
}
