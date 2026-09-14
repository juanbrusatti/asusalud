"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelAppointment,
  confirmAppointment,
  getManageSlots,
  rescheduleAppointment,
} from "@/lib/actions/autogestion";
import { blockMessage, nextDays, type ManageView } from "@/lib/autogestion";
import { timeIn, todayIn } from "@/lib/tz";
import { whatsappLink } from "@/lib/phone";

type Panel = "nada" | "mover" | "cancelar";
type Hecho = "cancelado" | "movido" | "confirmado";

/**
 * Lo que el cliente puede hacer con su turno.
 *
 * El orden de los botones no es casual: confirmar y mover van primero porque
 * son los que conservan el turno. Cancelar va último y en tono neutro, sin
 * rojo de alarma: no es un error, es un aviso, y justamente lo que queremos es
 * que lo dé en lugar de no aparecer.
 */
export function Acciones({
  token,
  vista,
}: {
  token: string;
  vista: ManageView;
}) {
  const tz = vista.tenant.timezone;
  const [panel, setPanel] = useState<Panel>("nada");
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [dia, setDia] = useState(todayIn(tz));
  const [slots, setSlots] = useState<string[]>([]);
  const [buscando, startBuscar] = useTransition();
  const [motivo, setMotivo] = useState("");

  const dias = nextDays(todayIn(tz), 14);

  useEffect(() => {
    if (panel !== "mover") return;
    let vivo = true;

    // El estado se escribe cuando vuelve la consulta, nunca de forma
    // sincrónica dentro del efecto.
    startBuscar(async () => {
      const libres = await getManageSlots(token, dia);
      if (vivo) setSlots(libres);
    });

    return () => {
      vivo = false;
    };
  }, [panel, dia, token]);

  async function correr(fn: () => Promise<{ ok: boolean; error?: string }>, ok: Hecho) {
    setEnviando(true);
    setError(null);
    const r = await fn();
    setEnviando(false);
    if (r.ok) {
      setPanel("nada");
      setHecho(ok);
    } else {
      setError(r.error ?? "No se pudo. Probá de nuevo.");
    }
  }

  if (hecho) {
    const textos: Record<Hecho, { title: string; detail: string }> = {
      cancelado: {
        title: "Listo, quedó avisado",
        detail:
          "Tu turno se canceló y el horario ya está libre para otra persona. Gracias por avisar: es lo que permite que no quede un hueco.",
      },
      movido: {
        title: "Listo, lo movimos",
        detail:
          "Arriba está tu turno con el horario nuevo. Si te lo mandamos por mensaje, el enlace sigue siendo el mismo.",
      },
      confirmado: {
        title: "Confirmado",
        detail: "Te esperamos. Si algo cambia, avisá desde este mismo enlace.",
      },
    };
    const t = textos[hecho];

    return (
      <Card>
        <CardBody className="grid gap-2">
          <p className="font-hand text-[32px] leading-none text-accent-text">
            {t.title}
          </p>
          <p className="text-[14.5px] leading-relaxed text-muted">{t.detail}</p>
        </CardBody>
      </Card>
    );
  }

  // Nada que hacer: se explica por qué y se ofrece la salida que corresponde.
  if (!vista.can.cancel && !vista.can.reschedule && !vista.can.confirm) {
    if (!vista.why) return null;
    const m = blockMessage(vista.why, vista.cancelMinHours);
    const wa = whatsappLink(vista.tenant.phone);

    return (
      <Card>
        <CardBody className="grid justify-items-start gap-2">
          <CardTitle>{m.title}</CardTitle>
          <p className="text-[14.5px] leading-relaxed text-muted">{m.detail}</p>
          {wa && (
            <Button asChild className="mt-1">
              <a href={wa} target="_blank" rel="noopener noreferrer">
                Escribirle a {vista.tenant.name}
              </a>
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {panel === "nada" && (
        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>¿Necesitás cambiar algo?</CardTitle>

            {vista.can.confirm && (
              <Button
                size="lg"
                disabled={enviando}
                onClick={() =>
                  correr(() => confirmAppointment(token), "confirmado")
                }
              >
                {enviando ? "Un momento…" : "Confirmar que voy"}
              </Button>
            )}

            {vista.can.reschedule && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setPanel("mover")}
              >
                Cambiar el día o el horario
              </Button>
            )}

            {vista.can.cancel && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setPanel("cancelar")}
              >
                No voy a poder ir
              </Button>
            )}

            <p className="text-[12.5px] leading-snug text-muted">
              Se puede hasta {vista.cancelMinHours}{" "}
              {vista.cancelMinHours === 1 ? "hora" : "horas"} antes del turno.
              {vista.can.reschedule &&
                ` Te ${vista.reschedulesLeft === 1 ? "queda" : "quedan"} ${vista.reschedulesLeft} ${
                  vista.reschedulesLeft === 1 ? "cambio" : "cambios"
                } de horario.`}
            </p>

            {error && (
              <p
                role="alert"
                className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
              >
                {error}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {panel === "mover" && (
        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>¿Cuándo te queda cómodo?</CardTitle>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {dias.map((d) => {
                const activo = d === dia;
                const etiqueta = new Intl.DateTimeFormat("es-AR", {
                  timeZone: tz,
                  weekday: "short",
                  day: "numeric",
                }).format(new Date(`${d}T12:00:00Z`));

                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setDia(d)}
                    className={`shrink-0 rounded-pill border-[1.5px] px-3.5 py-2 text-[13px] font-medium capitalize ${
                      activo
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {etiqueta.replace(".", "")}
                  </button>
                );
              })}
            </div>

            {buscando ? (
              <p className="text-[14px] text-muted">Buscando horarios…</p>
            ) : slots.length === 0 ? (
              <p className="text-[14px] leading-relaxed text-muted">
                Ese día no queda ningún horario libre para lo que tenías
                reservado. Probá con otro.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {slots.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() =>
                        correr(() => rescheduleAppointment(token, s), "movido")
                      }
                      className="rounded-pill border-[1.5px] border-line bg-surface px-3.5 py-2 text-[13.5px] tabular-nums hover:border-accent disabled:opacity-50"
                    >
                      {timeIn(s, tz)}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
              >
                {error}
              </p>
            )}

            <div className="flex">
              <Button variant="ghost" onClick={() => setPanel("nada")}>
                Volver
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {panel === "cancelar" && (
        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>¿Seguro que no vas a poder ir?</CardTitle>
            <p className="text-[14px] leading-relaxed text-muted">
              El horario queda libre para otra persona. Si preferís moverlo en
              vez de cancelarlo, todavía estás a tiempo.
            </p>

            <Textarea
              label="¿Querés contarle por qué? (opcional)"
              name="motivo"
              rows={2}
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Me salió un viaje"
            />

            {error && (
              <p
                role="alert"
                className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
              >
                {error}
              </p>
            )}

            <div className="grid gap-2">
              <Button
                size="lg"
                disabled={enviando}
                onClick={() =>
                  correr(() => cancelAppointment(token, motivo), "cancelado")
                }
              >
                {enviando ? "Avisando…" : "Sí, cancelar el turno"}
              </Button>
              {vista.can.reschedule && (
                <Button variant="outline" onClick={() => setPanel("mover")}>
                  Mejor lo muevo de día
                </Button>
              )}
              <Button variant="ghost" onClick={() => setPanel("nada")}>
                Volver
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
