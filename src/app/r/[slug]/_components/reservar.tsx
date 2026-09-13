"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AvisosClienta } from "@/components/pwa/avisos-clienta";
import { createBooking, getSlots } from "@/lib/actions/reserva";
import { formatDuration, formatPrice } from "@/lib/money";
import { longDateIn, nextDay, timeIn, todayIn } from "@/lib/tz";
import type { BookingPage } from "@/lib/data/reserva";

type Paso = "servicios" | "cuando" | "datos" | "listo";

/**
 * La reserva, en cuatro pasos.
 *
 * Se ve el precio y la duración antes de elegir el horario, porque quien
 * reserva quiere saber cuánto sale y cuánto le va a llevar antes de
 * comprometer una hora de su día.
 */
export function Reservar({
  page,
  vapidPublicKey,
}: {
  page: BookingPage;
  vapidPublicKey: string;
}) {
  const tz = page.tenant.timezone;

  const [paso, setPaso] = useState<Paso>("servicios");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [dia, setDia] = useState(todayIn(tz));
  const [slots, setSlots] = useState<string[]>([]);
  const [horario, setHorario] = useState<string | null>(null);
  const [buscando, startBuscar] = useTransition();

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const servicios = elegidos
    .map((id) => page.services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const minutos = servicios.reduce((n, s) => n + s.durationMinutes, 0);
  const total = servicios.reduce((n, s) => n + (s.priceCents ?? 0), 0);
  const hayAConvenir = servicios.some((s) => s.onRequest);

  useEffect(() => {
    if (paso !== "cuando" || elegidos.length === 0) return;

    let vivo = true;

    // El estado se escribe recién cuando vuelve la consulta, nunca de forma
    // sincrónica dentro del efecto: eso encadena renders.
    startBuscar(async () => {
      const libres = await getSlots(page.tenant.slug, elegidos, dia);
      if (!vivo) return;
      setSlots(libres);
      setHorario(null);
    });

    return () => {
      vivo = false;
    };
  }, [paso, dia, elegidos, page.tenant.slug]);

  async function confirmar() {
    if (!horario) return;
    setGuardando(true);
    setError(null);

    const r = await createBooking({
      slug: page.tenant.slug,
      serviceIds: elegidos,
      startsAt: horario,
      firstName: nombre,
      lastName: apellido || undefined,
      phone: telefono,
      email: correo || undefined,
      notes: nota || undefined,
    });

    setGuardando(false);
    if (r.ok) {
      setToken(r.manageToken);
      setPaso("listo");
    } else setError(r.error);
  }

  // -------------------------------------------------------------------------

  if (paso === "listo") {
    return (
      <Card accent>
        <CardBody className="grid gap-3">
          <p className="font-hand text-[44px] leading-none">Listo</p>
          <CardTitle>Tu turno quedó reservado</CardTitle>
          <p className="text-[15px] leading-relaxed opacity-90">
            {horario && (
              <>
                Te esperamos el{" "}
                <strong className="capitalize">
                  {longDateIn(
                    new Intl.DateTimeFormat("en-CA", {
                      timeZone: tz,
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date(horario)),
                    tz,
                  )}
                </strong>{" "}
                a las <strong>{timeIn(horario, tz)}</strong>.
              </>
            )}
          </p>
          <p className="text-[13.5px] leading-relaxed opacity-80">
            Te vamos a mandar un recordatorio antes.
          </p>

          {token && (
            <>
              <div className="mt-1 grid justify-items-start gap-2 rounded-[16px] bg-white/15 px-4 py-3.5">
                <p className="text-[13.5px] leading-relaxed">
                  Si después no podés venir o querés otro horario, cambialo vos
                  misma desde acá. Guardá el enlace.
                </p>
                <a
                  href={`/t/${token}`}
                  className="rounded-pill bg-surface px-4 py-2 text-[13.5px] font-medium text-ink"
                >
                  Ver mi turno
                </a>
              </div>

              {/* El único canal gratis del sistema, y este es el único momento
                  en que la clienta tiene un motivo real para aceptarlo: acaba
                  de reservar y le importa que le avisen. */}
              <AvisosClienta
                token={token}
                vapidPublicKey={vapidPublicKey}
                tono="acento"
              />
            </>
          )}
        </CardBody>
      </Card>
    );
  }

  const proximosDias = Array.from({ length: 14 }, (_, i) =>
    nextDay(todayIn(tz), i),
  );

  return (
    <div className="grid gap-4">
      {/* Paso 1 */}
      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>¿Qué te querés hacer?</CardTitle>

          <ul className="grid gap-1.5">
            {page.services.map((s) => {
              const activo = elegidos.includes(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={activo}
                    onClick={() => {
                      setElegidos(
                        activo
                          ? elegidos.filter((x) => x !== s.id)
                          : [...elegidos, s.id],
                      );
                      setPaso("servicios");
                    }}
                    className={`flex w-full items-center gap-3 rounded-[16px] border-[1.5px] px-4 py-3 text-left ${
                      activo
                        ? "border-accent bg-accent-wash"
                        : "border-line bg-surface hover:border-accent"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {s.name}
                      </span>
                      <span className="block text-[12.5px] text-muted">
                        {formatDuration(s.durationMinutes)}
                        {s.description ? ` · ${s.description}` : ""}
                      </span>
                    </span>
                    {page.settings.showPrices && (
                      <span className="shrink-0 text-[14px] tabular-nums text-muted">
                        {s.onRequest ? "A convenir" : formatPrice(s.priceCents)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {servicios.length > 0 && (
            <>
              <div className="rounded-[16px] bg-surface-2 px-4 py-3 text-[14px]">
                <p>
                  <strong>{formatDuration(minutos)}</strong> en total
                  {page.settings.showPrices && total > 0 && (
                    <>
                      {" · "}
                      <strong>{formatPrice(total)}</strong>
                      {hayAConvenir && " más lo que se convenga"}
                    </>
                  )}
                </p>
              </div>

              {paso === "servicios" && (
                <Button size="lg" onClick={() => setPaso("cuando")}>
                  Elegir día y horario
                </Button>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* Paso 2 */}
      {(paso === "cuando" || paso === "datos") && (
        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>¿Cuándo te queda cómodo?</CardTitle>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {proximosDias.map((d) => {
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
                    onClick={() => {
                      setDia(d);
                      setPaso("cuando");
                    }}
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
              <p className="rounded-[16px] bg-surface-2 px-4 py-3 text-[14px] text-muted">
                No quedan horarios ese día. Probá con otro.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={horario === s}
                    onClick={() => {
                      setHorario(s);
                      setPaso("datos");
                    }}
                    className={`rounded-pill border-[1.5px] px-3.5 py-2 text-[13.5px] font-medium tabular-nums ${
                      horario === s
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {timeIn(s, tz)}
                  </button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Paso 3 */}
      {paso === "datos" && horario && (
        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>¿Cómo te contactamos?</CardTitle>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nombre"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Mirián"
              />
              <Field
                label="Apellido"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                placeholder="Ortiz"
              />
            </div>

            <Field
              label="Teléfono"
              type="tel"
              inputMode="tel"
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="0358 15 412-3456"
              hint="Es por donde te vamos a mandar el recordatorio."
            />

            <Field
              label="Correo"
              type="email"
              inputMode="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="vos@ejemplo.com"
              hint="Opcional, pero si lo dejás te avisamos por ahí y te llega antes."
            />

            <Textarea
              label="Algo que tengamos que saber"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={500}
              placeholder="Alergias, si venís con alguien, si preferís que te llamemos antes…"
            />

            {error && (
              <p
                role="alert"
                className="rounded-[14px] bg-danger-wash px-4 py-3 text-[13.5px] text-danger"
              >
                {error}
              </p>
            )}

            <Button
              size="lg"
              disabled={guardando || !nombre || !telefono}
              onClick={() => void confirmar()}
            >
              {guardando
                ? "Reservando…"
                : `Reservar el ${timeIn(horario, tz)}`}
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
