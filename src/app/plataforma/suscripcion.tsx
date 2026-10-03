"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  registrarPagoSuscripcion,
  type PlataformaState,
} from "@/lib/actions/plataforma";
import { formatPrice } from "@/lib/money";
import { diasHasta, formatFecha, type Suscripcion } from "@/lib/suscripcion";

const INICIAL: PlataformaState = { error: null };

const CHIP: Record<string, [string, string]> = {
  prueba: ["En prueba", "bg-accent-wash text-accent-text"],
  activa: ["Al día", "bg-ok-wash text-ok"],
  a_pagar: ["Vencido", "bg-warn-wash text-warn"],
  suspendida: ["Suspendida", "bg-warn text-on-accent"],
};

/**
 * Una cuenta en abono mensual, en el panel.
 *
 * El pago a mano es para lo que no pasa por Mercado Pago: una transferencia o
 * efectivo. Con cero se regala un mes, que es como se extiende una prueba sin
 * inventar otra herramienta.
 */
export function SuscripcionFila({
  s,
}: {
  s: Suscripcion & {
    tenant_id: string;
    nombre: string;
    ultimo_pago: { fecha: string; pagado_cents: number } | null;
  };
}) {
  const [estado, accion, pendiente] = useActionState(
    registrarPagoSuscripcion.bind(null, s.tenant_id),
    INICIAL,
  );
  const [chip, color] = CHIP[s.estado] ?? ["", ""];

  const cuando =
    s.estado === "prueba"
      ? `Prueba hasta el ${formatFecha(s.prueba_hasta)} (${diasHasta(s.prueba_hasta)} días)`
      : s.estado === "activa"
        ? `Cubierta hasta el ${formatFecha(s.pagado_hasta)}`
        : s.estado === "a_pagar"
          ? `Venció el ${formatFecha(s.pagado_hasta)} · se suspende el ${formatFecha(s.gracia_hasta)}`
          : `Suspendida desde el ${formatFecha(s.gracia_hasta)}`;

  return (
    <Card>
      <CardBody className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15.5px] font-semibold">{s.nombre}</p>
            <p className="text-[13px] text-muted">{cuando}</p>
            {s.ultimo_pago && (
              <p className="text-[12.5px] text-faint">
                Último pago: {formatPrice(s.ultimo_pago.pagado_cents)} el{" "}
                {formatFecha(s.ultimo_pago.fecha)}
              </p>
            )}
          </div>
          <span className={`rounded-pill px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider ${color}`}>
            {chip}
          </span>
        </div>

        <form action={accion} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[12.5px] text-muted">
            Importe
            <input
              name="monto"
              inputMode="numeric"
              defaultValue={String((s.abono_cents ?? 0) / 100)}
              className="w-28 rounded-[12px] border-[1.5px] border-line bg-surface px-3 py-2 text-[14px] text-ink"
            />
          </label>
          <label className="grid min-w-0 flex-1 gap-1 text-[12.5px] text-muted">
            Nota
            <input
              name="nota"
              placeholder="Transferencia, efectivo, mes regalado…"
              className="rounded-[12px] border-[1.5px] border-line bg-surface px-3 py-2 text-[14px] text-ink"
            />
          </label>
          <Button type="submit" size="sm" disabled={pendiente}>
            {pendiente ? "Registrando…" : "Registrar pago"}
          </Button>
        </form>

        {estado.error && (
          <p role="alert" className="text-[12.5px] text-danger">{estado.error}</p>
        )}
        {estado.notice && (
          <p role="status" className="text-[12.5px] text-ok">{estado.notice}</p>
        )}
      </CardBody>
    </Card>
  );
}
