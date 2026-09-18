"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Copiable } from "@/components/ui/copiable";
import {
  cambiarCobro,
  cambiarImporteMes,
  deshacerPago,
  generarEnlaceClave,
  marcarPagado,
  recordarCuenta,
  type EnlaceClave,
  type PlataformaState,
} from "@/lib/actions/plataforma";
import {
  bpsToInput,
  formatComision,
  formatMes,
  parseComisionToBps,
  type Modo,
  type NegocioPlataforma,
} from "@/lib/cuenta";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/money";

/**
 * Un negocio en el panel de Dlay.
 *
 * Marcar un pago es escribir plata, así que pide confirmación en el mismo
 * lugar y no con un cartel del navegador: el botón se convierte en la
 * pregunta. Y todo lo que se marca se puede deshacer, porque marcar el mes
 * equivocado a las once de la noche es cuestión de tiempo.
 *
 * Recordar no pide confirmación: no mueve plata, y lo peor que puede pasar es
 * mandarlo dos veces, que está permitido a propósito.
 */
export function Negocio({ negocio }: { negocio: NegocioPlataforma }) {
  const [pendiente, empezar] = useTransition();
  const [estado, setEstado] = useState<PlataformaState | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  // El editor de la forma de cobro.
  const [editandoCobro, setEditandoCobro] = useState(false);
  const [modo, setModo] = useState<Modo>(negocio.modo);
  const [porcentaje, setPorcentaje] = useState(bpsToInput(negocio.comision_bps));
  const [fijo, setFijo] = useState(centsToInput(negocio.fijo_cents));

  // El importe de un mes puntual.
  const [editandoMes, setEditandoMes] = useState<string | null>(null);
  const [importeMes, setImporteMes] = useState("");

  // El enlace para que pongan una contraseña nueva.
  const [enlace, setEnlace] = useState<EnlaceClave | null>(null);

  const correr = (fn: () => Promise<PlataformaState>) =>
    empezar(async () => {
      setEstado(await fn());
      setConfirmando(null);
    });

  const comoCobra =
    negocio.modo === "fixed"
      ? `${formatPrice(negocio.fijo_cents)} por mes`
      : `${formatComision(negocio.comision_bps)} de lo facturado`;

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
            <dd className="text-right tabular-nums">
              {formatPrice(negocio.mes_actual.total_cents)}
              <span className="block text-[12px] text-faint">
                {negocio.mes_actual.cantidad}{" "}
                {negocio.mes_actual.cantidad === 1 ? "turno" : "turnos"} ·{" "}
                {formatPrice(negocio.mes_actual.base_cents)} facturados
              </span>
            </dd>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted">Cobro</dt>
            <dd className="flex items-center gap-2">
              <span className="tabular-nums">{comoCobra}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditandoCobro(true)}
              >
                Cambiar
              </Button>
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

        <div className="grid gap-2 border-t-[1.5px] border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13.5px] text-muted">
              ¿Se olvidaron la contraseña?
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={pendiente}
              onClick={() =>
                empezar(async () => {
                  setEnlace(await generarEnlaceClave(negocio.tenant_id));
                })
              }
            >
              {enlace?.url ? "Generar otro" : "Generar enlace"}
            </Button>
          </div>

          {enlace?.error && (
            <p role="alert" className="text-[12.5px] text-danger">
              {enlace.error}
            </p>
          )}

          {enlace?.url && (
            <div className="grid gap-2 rounded-[14px] bg-surface-2 p-3.5">
              <Copiable
                label={`Enlace para ${enlace.correo}`}
                valor={enlace.url}
                hint="Mandáselo por WhatsApp. Sirve una sola vez y vence en una hora."
              />
              <p className="text-[12px] leading-relaxed text-faint">
                Quien lo abra entra a la cuenta y elige su contraseña. Tratalo
                como una llave: no lo pegues en ningún grupo.
              </p>
            </div>
          )}
        </div>

        {editandoCobro && (
          <div className="grid gap-3 rounded-card border-[1.5px] border-line bg-surface-2 p-4">
            <p className="text-[13.5px] font-medium">¿Cómo se le cobra?</p>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["percent", "Un porcentaje"],
                  ["fixed", "Un abono fijo"],
                ] as const
              ).map(([valor, texto]) => (
                <Button
                  key={valor}
                  size="sm"
                  variant={modo === valor ? "solid" : "outline"}
                  onClick={() => setModo(valor)}
                >
                  {texto}
                </Button>
              ))}
            </div>

            {modo === "percent" ? (
              <Field
                label="Porcentaje de lo facturado"
                className="h-10 w-28 text-[14px]"
                inputMode="decimal"
                value={porcentaje}
                onChange={(e) => setPorcentaje(e.target.value)}
                hint="Sube y baja con lo que factura el negocio."
              />
            ) : (
              <Field
                label="Importe por mes"
                className="h-10 w-36 text-[14px]"
                inputMode="numeric"
                value={fijo}
                onChange={(e) => setFijo(e.target.value)}
                hint="El mismo todos los meses, facture lo que facture."
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={pendiente}
                onClick={() => {
                  const bps = parseComisionToBps(porcentaje) ?? 0;
                  const cents = parsePriceToCents(fijo) ?? 0;

                  if (modo === "percent" && parseComisionToBps(porcentaje) === null) {
                    setEstado({ error: "Poné un porcentaje entre 0 y 100." });
                    return;
                  }
                  if (modo === "fixed" && !cents) {
                    setEstado({ error: "Poné el importe del abono." });
                    return;
                  }

                  correr(async () => {
                    const r = await cambiarCobro(
                      negocio.tenant_id,
                      modo,
                      bps,
                      cents,
                    );
                    if (!r.error) setEditandoCobro(false);
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
                  setModo(negocio.modo);
                  setPorcentaje(bpsToInput(negocio.comision_bps));
                  setFijo(centsToInput(negocio.fijo_cents));
                  setEditandoCobro(false);
                }}
              >
                Cancelar
              </Button>
            </div>

            <p className="text-[12.5px] leading-relaxed text-faint">
              Cambiarlo no toca los meses ya cobrados: cada pago congeló su
              importe al marcarse.
            </p>
          </div>
        )}

        {negocio.pendientes.length > 0 && (
          <div className="grid gap-2 border-t-[1.5px] border-line pt-3">
            <p className="text-[13.5px] font-medium">
              Sin cobrar · {formatPrice(negocio.pendiente_total_cents)}
            </p>

            <ul className="grid gap-1">
              {negocio.pendientes.map((m) => (
                <li
                  key={m.periodo}
                  className="grid gap-2 rounded-[14px] bg-surface-2 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">
                        {formatMes(m.periodo)}
                        {m.a_mano && (
                          <span className="ml-2 rounded-pill bg-accent-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent-text">
                            a mano
                          </span>
                        )}
                      </p>
                      <p className="text-[12.5px] text-muted tabular-nums">
                        {m.cantidad} {m.cantidad === 1 ? "turno" : "turnos"} ·{" "}
                        {formatPrice(m.base_cents)} facturados →{" "}
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
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmando(m.periodo)}
                        >
                          Marcar pagado
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pendiente}
                          onClick={() =>
                            correr(() =>
                              recordarCuenta(negocio.tenant_id, m.periodo),
                            )
                          }
                        >
                          Recordar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setImporteMes(centsToInput(m.total_cents));
                            setEditandoMes(m.periodo);
                          }}
                        >
                          Importe
                        </Button>
                      </div>
                    )}
                  </div>

                  {editandoMes === m.periodo && (
                    <div className="grid gap-2 border-t-[1.5px] border-line pt-2.5">
                      <Field
                        label={`Lo que se cobra por ${formatMes(m.periodo).toLowerCase()}`}
                        className="h-10 w-36 text-[14px]"
                        inputMode="numeric"
                        value={importeMes}
                        onChange={(e) => setImporteMes(e.target.value)}
                        hint="Sólo para este mes. No cambia lo pactado."
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={pendiente}
                          onClick={() => {
                            const cents = parsePriceToCents(importeMes);
                            if (cents === null) {
                              setEstado({ error: "Ese importe no se entiende." });
                              return;
                            }
                            correr(async () => {
                              const r = await cambiarImporteMes(
                                negocio.tenant_id,
                                m.periodo,
                                cents,
                              );
                              if (!r.error) setEditandoMes(null);
                              return r;
                            });
                          }}
                        >
                          Guardar
                        </Button>
                        {m.a_mano && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pendiente}
                            onClick={() =>
                              correr(async () => {
                                const r = await cambiarImporteMes(
                                  negocio.tenant_id,
                                  m.periodo,
                                  null,
                                );
                                if (!r.error) setEditandoMes(null);
                                return r;
                              })
                            }
                          >
                            Volver a lo pactado
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditandoMes(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
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
