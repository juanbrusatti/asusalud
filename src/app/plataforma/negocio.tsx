"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import {
  cambiarPrecio,
  deshacerPago,
  marcarPagado,
  type PlataformaState,
} from "@/lib/actions/plataforma";
import { formatMes, type NegocioPlataforma } from "@/lib/cuenta";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/money";

/**
 * Un negocio en el panel de Dlay.
 *
 * Marcar un pago es escribir plata, así que pide confirmación en el mismo
 * lugar y no con un cartel del navegador: el botón se convierte en la
 * pregunta. Y todo lo que se marca se puede deshacer, porque marcar el mes
 * equivocado a las once de la noche es cuestión de tiempo.
 */
export function Negocio({ negocio }: { negocio: NegocioPlataforma }) {
  const [pendiente, empezar] = useTransition();
  const [estado, setEstado] = useState<PlataformaState | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [precio, setPrecio] = useState(centsToInput(negocio.precio_cents));

  const correr = (fn: () => Promise<PlataformaState>) =>
    empezar(async () => {
      setEstado(await fn());
      setConfirmando(null);
    });

  return (
    <Card>
      <CardBody className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{negocio.nombre}</CardTitle>
            <p className="mt-0.5 text-[12.5px] text-faint">
              /{negocio.slug} · desde{" "}
              {new Date(negocio.creado).toLocaleDateString("es-AR")}
            </p>
          </div>

          {negocio.estado !== "active" && (
            <span className="rounded-pill bg-warn-wash px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-warn">
              {negocio.estado}
            </span>
          )}
        </div>

        <dl className="grid gap-1.5 border-t-[1.5px] border-line pt-3 text-[14px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Este mes, hasta hoy</dt>
            <dd className="tabular-nums">
              {negocio.mes_actual.cantidad}{" "}
              {negocio.mes_actual.cantidad === 1 ? "turno" : "turnos"} ·{" "}
              {formatPrice(negocio.mes_actual.total_cents)}
            </dd>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted">Precio por turno</dt>
            <dd className="flex items-center gap-2">
              {editandoPrecio ? (
                <>
                  <Field
                    label="Precio por turno"
                    className="h-9 w-28 text-[14px]"
                    inputMode="numeric"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={pendiente}
                    onClick={() => {
                      const cents = parsePriceToCents(precio);
                      if (cents === null) {
                        setEstado({ error: "Ese precio no se entiende." });
                        return;
                      }
                      correr(async () => {
                        const r = await cambiarPrecio(negocio.tenant_id, cents);
                        if (!r.error) setEditandoPrecio(false);
                        return r;
                      });
                    }}
                  >
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPrecio(centsToInput(negocio.precio_cents));
                      setEditandoPrecio(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <span className="tabular-nums">
                    {formatPrice(negocio.precio_cents)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditandoPrecio(true)}
                  >
                    Cambiar
                  </Button>
                </>
              )}
            </dd>
          </div>

          {negocio.ultimo_pago && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted">Último pago</dt>
              <dd className="flex items-center gap-2">
                <span className="tabular-nums">
                  {formatMes(negocio.ultimo_pago.periodo)} ·{" "}
                  {formatPrice(negocio.ultimo_pago.monto_cents)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendiente}
                  onClick={() =>
                    correr(() =>
                      deshacerPago(
                        negocio.tenant_id,
                        negocio.ultimo_pago!.periodo,
                      ),
                    )
                  }
                >
                  Deshacer
                </Button>
              </dd>
            </div>
          )}
        </dl>

        {negocio.pendientes.length > 0 && (
          <div className="grid gap-2 border-t-[1.5px] border-line pt-3">
            <p className="text-[13.5px] font-medium">
              Sin cobrar · {formatPrice(negocio.pendiente_total_cents)}
            </p>

            <ul className="grid gap-1">
              {negocio.pendientes.map((m) => (
                <li
                  key={m.periodo}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] bg-surface-2 px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">
                      {formatMes(m.periodo)}
                    </p>
                    <p className="text-[12.5px] text-muted tabular-nums">
                      {m.cantidad} {m.cantidad === 1 ? "turno" : "turnos"} ·{" "}
                      {formatPrice(m.total_cents)}
                    </p>
                  </div>

                  {confirmando === m.periodo ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pendiente}
                        onClick={() =>
                          correr(() =>
                            marcarPagado(negocio.tenant_id, m.periodo),
                          )
                        }
                      >
                        {pendiente ? "Marcando…" : "Sí, cobrado"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmando(null)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmando(m.periodo)}
                    >
                      Marcar pagado
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {estado?.error && (
          <p
            role="alert"
            className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
          >
            {estado.error}
          </p>
        )}
        {estado?.notice && (
          <p className="rounded-[14px] bg-ok-wash px-3.5 py-2.5 text-[13.5px] text-ok">
            {estado.notice}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
