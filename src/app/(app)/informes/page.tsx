import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardFigure, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { METHOD_LABELS } from "@/lib/caja";
import {
  CHANNEL_LABELS,
  describeRange,
  getReport,
  resolveRange,
  share,
} from "@/lib/data/informes";
import { formatDuration, formatPrice } from "@/lib/money";
import { todayIn } from "@/lib/tz";
import { Periodo } from "./_components/periodo";
import { Proporcion } from "./_components/proporcion";

export const metadata: Metadata = { title: "Informes" };

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; desde?: string; hasta?: string }>;
}) {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  // El informe es la foto del negocio entero: la ve quien lo maneja.
  if (!atLeast(membership.role, "admin")) notFound();

  const tz = membership.tenant.timezone;
  const range = resolveRange(await searchParams, todayIn(tz));
  const report = await getReport(range.from, range.to);

  if (!report) return null;

  const { money, agenda, services, reminders, messages } = report;
  const netoCents = money.incomeCents - money.expenseCents;

  const resueltos = agenda.attended + agenda.noShow;
  const ausentismo = share(agenda.noShow, resueltos);
  const ocupacion = share(agenda.bookedMinutes, report.openMinutes);

  const facturadoCents = services.reduce((t, s) => t + s.revenueCents, 0);
  const topServicio = services[0]?.revenueCents ?? 0;

  const conAviso = reminders.withReminder;
  const sinAviso = reminders.without;
  const faltaConAviso = share(conAviso.noShows, conAviso.total);
  const faltaSinAviso = share(sinAviso.noShows, sinAviso.total);
  // Comparar dos porcentajes sacados de dos o tres turnos es inventar una
  // conclusión. Recién con unos cuantos casos de cada lado dice algo.
  const comparable =
    faltaConAviso !== null &&
    faltaSinAviso !== null &&
    conAviso.total >= 5 &&
    sinAviso.total >= 5;

  return (
    <>

      <main className="mx-auto grid max-w-3xl gap-5 px-4 py-8">
        <header>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Informes
          </h1>
          <p className="mt-1 max-w-prose text-[14.5px] text-muted">
            {describeRange(range)}. Lo que entró, cómo respondió la agenda y qué
            servicios dejan más.
          </p>
        </header>

        <Periodo range={range} />

        {/* ---------------------------------------------------------------
            Plata
        --------------------------------------------------------------- */}
        <section className="grid gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            Lo que entró por la caja
          </h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card accent>
              <CardBody className="grid gap-1">
                <CardFigure>{formatPrice(money.incomeCents)}</CardFigure>
                <p className="text-[12.5px] opacity-80">cobrado</p>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="grid gap-1">
                <CardFigure>{formatPrice(money.expenseCents)}</CardFigure>
                <p className="text-[12.5px] text-muted">gastos</p>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="grid gap-1">
                <CardFigure className={netoCents < 0 ? "text-danger" : ""}>
                  {formatPrice(netoCents)}
                </CardFigure>
                <p className="text-[12.5px] text-muted">queda</p>
              </CardBody>
            </Card>
          </div>

          {money.byMethod.length > 0 ? (
            <Card>
              <CardBody className="grid gap-2">
                <CardTitle>Por medio de pago</CardTitle>
                <dl className="grid gap-1.5 text-[14.5px] tabular-nums">
                  {money.byMethod.map((m) => (
                    <div key={m.method} className="flex justify-between gap-3">
                      <dt>{METHOD_LABELS[m.method]}</dt>
                      <dd className={m.cents < 0 ? "text-danger" : ""}>
                        {formatPrice(m.cents)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[12.5px] leading-snug text-muted">
                  Sale de los movimientos de caja del período, con sus
                  anulaciones ya descontadas.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <p className="text-[14px] leading-relaxed text-muted">
                  No hay movimientos de caja en este período. Los cobros se
                  cargan desde la caja o, más rápido, desde la pantalla de cada
                  turno.
                </p>
              </CardBody>
            </Card>
          )}
        </section>

        {/* ---------------------------------------------------------------
            Agenda
        --------------------------------------------------------------- */}
        <section className="grid gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            Cómo respondió la agenda
          </h2>

          <Card>
            <CardBody className="grid gap-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                {[
                  ["Turnos", agenda.total],
                  ["Atendidos", agenda.attended],
                  ["No vinieron", agenda.noShow],
                  ["Cancelados", agenda.cancelled],
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta as string}>
                    <dd className="text-[22px] font-semibold tabular-nums">
                      {valor}
                    </dd>
                    <dt className="text-[12.5px] text-muted">{etiqueta}</dt>
                  </div>
                ))}
              </dl>

              {agenda.upcoming > 0 && (
                <p className="text-[12.5px] leading-snug text-muted">
                  Quedan {agenda.upcoming} sin marcar como atendidos o ausentes.
                  Hasta que se marquen no entran en el ausentismo ni en lo
                  facturado por servicio.
                </p>
              )}

              {ausentismo !== null ? (
                <div className="grid gap-2 border-t-[1.5px] border-line pt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14.5px] font-medium">
                      Ausentismo
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums">
                      {ausentismo}%
                    </span>
                  </div>
                  <Proporcion
                    value={agenda.noShow}
                    total={resueltos}
                    tone="danger"
                    label={`${ausentismo}% de ausencias`}
                  />
                  <p className="text-[12.5px] leading-snug text-muted">
                    {agenda.noShow} de {resueltos} turnos ya cumplidos. Los
                    cancelados no cuentan: avisar que no venís no es faltar.
                  </p>
                </div>
              ) : (
                <p className="border-t-[1.5px] border-line pt-4 text-[13px] leading-snug text-muted">
                  Todavía no hay turnos cumplidos en el período, así que no hay
                  ausentismo que calcular.
                </p>
              )}

              {/* Sin un solo turno, "0% de ocupación" no informa nada que las
                  cifras de arriba no digan ya. */}
              {ocupacion !== null && agenda.total > 0 && (
                <div className="grid gap-2 border-t-[1.5px] border-line pt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14.5px] font-medium">Ocupación</span>
                    <span className="text-[15px] font-semibold tabular-nums">
                      {ocupacion}%
                    </span>
                  </div>
                  <Proporcion
                    value={agenda.bookedMinutes}
                    total={report.openMinutes}
                    label={`${ocupacion}% de la agenda ocupada`}
                  />
                  <p className="text-[12.5px] leading-snug text-muted">
                    {formatDuration(agenda.bookedMinutes)} agendados sobre{" "}
                    {formatDuration(report.openMinutes)} de atención, según los
                    horarios cargados en Ajustes.
                  </p>
                </div>
              )}

              {agenda.online > 0 && (
                <p className="border-t-[1.5px] border-line pt-4 text-[13px] leading-snug text-muted">
                  {agenda.online}{" "}
                  {agenda.online === 1 ? "turno se sacó" : "turnos se sacaron"}{" "}
                  por la reserva online, sin que nadie los cargue a mano.
                </p>
              )}
            </CardBody>
          </Card>
        </section>

        {/* ---------------------------------------------------------------
            Servicios
        --------------------------------------------------------------- */}
        <section className="grid gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            Qué servicios dejan más
          </h2>

          {services.length > 0 ? (
            <Card>
              <CardBody className="grid gap-4">
                <ul className="grid gap-3.5">
                  {services.map((s) => (
                    <li key={s.id ?? s.name} className="grid gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[14.5px] font-medium">
                          {s.name}
                        </span>
                        <span className="shrink-0 text-[14.5px] tabular-nums">
                          {formatPrice(s.revenueCents)}
                        </span>
                      </div>
                      <Proporcion
                        value={s.revenueCents}
                        total={topServicio}
                        label={`${s.name}: ${formatPrice(s.revenueCents)}`}
                      />
                      <p className="text-[12px] text-muted">
                        {s.count} {s.count === 1 ? "turno" : "turnos"} ·{" "}
                        {formatDuration(s.minutes)} de sillón
                      </p>
                    </li>
                  ))}
                </ul>

                <p className="border-t-[1.5px] border-line pt-4 text-[12.5px] leading-snug text-muted">
                  Suma {formatPrice(facturadoCents)} de turnos atendidos, al
                  precio que tenían cuando se agendaron. No es lo mismo que lo
                  cobrado: si esta cifra es bastante mayor, o falta cargar
                  cobros en la caja o hay clientes debiendo.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <p className="text-[14px] leading-relaxed text-muted">
                  Acá van a aparecer los servicios de los turnos marcados como
                  atendidos. En este período todavía no hay ninguno.
                </p>
              </CardBody>
            </Card>
          )}
        </section>

        {/* ---------------------------------------------------------------
            Recordatorios
        --------------------------------------------------------------- */}
        <section className="grid gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            ¿Sirven los recordatorios?
          </h2>

          <Card>
            <CardBody className="grid gap-4">
              {comparable ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <p className="text-[22px] font-semibold tabular-nums">
                        {faltaConAviso}%
                      </p>
                      <p className="text-[12.5px] text-muted">
                        faltó de {conAviso.total} turnos avisados
                      </p>
                    </div>
                    <div className="grid gap-1">
                      <p className="text-[22px] font-semibold tabular-nums">
                        {faltaSinAviso}%
                      </p>
                      <p className="text-[12.5px] text-muted">
                        faltó de {sinAviso.total} turnos sin aviso
                      </p>
                    </div>
                  </div>

                  <p className="border-t-[1.5px] border-line pt-4 text-[13px] leading-relaxed text-muted">
                    {faltaConAviso! < faltaSinAviso!
                      ? `Quien recibe el recordatorio falta menos. La diferencia es de ${faltaSinAviso! - faltaConAviso!} puntos.`
                      : faltaConAviso === faltaSinAviso
                        ? "Por ahora faltan igual con aviso y sin aviso. Con más turnos la comparación se vuelve más confiable."
                        : "Por ahora falta más quien recibe el aviso, que suele significar que se avisa justo a quien ya venía faltando."}
                  </p>
                </>
              ) : (
                <p className="text-[14px] leading-relaxed text-muted">
                  Todavía no hay turnos suficientes de los dos lados para
                  comparar. Hacen falta al menos cinco avisados y cinco sin
                  avisar; en este período hay {conAviso.total} y{" "}
                  {sinAviso.total}. Sacar un porcentaje de dos o tres turnos da
                  una cifra que suena precisa y no significa nada.
                </p>
              )}
            </CardBody>
          </Card>
        </section>

        {/* ---------------------------------------------------------------
            Costo de avisar
        --------------------------------------------------------------- */}
        <section className="grid gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
            Cuánto costó avisar
          </h2>

          <Card>
            <CardBody className="grid gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <CardFigure>{formatPrice(messages.costCents)}</CardFigure>
                <p className="text-[13.5px] text-muted">
                  {messages.sent}{" "}
                  {messages.sent === 1 ? "aviso enviado" : "avisos enviados"}
                </p>
              </div>

              {messages.byChannel.length > 0 && (
                <dl className="grid gap-1.5 text-[14px] tabular-nums">
                  {messages.byChannel.map((c) => (
                    <div key={c.channel} className="flex justify-between gap-3">
                      <dt>{CHANNEL_LABELS[c.channel]}</dt>
                      <dd>{c.count}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <p className="text-[12.5px] leading-snug text-muted">
                {messages.sent === 0
                  ? "No salió ningún aviso en este período."
                  : messages.costCents === 0
                    ? "Todo lo que salió fue gratis: el email y las notificaciones no se cobran, y los mensajes de WhatsApp dentro de una conversación ya abierta tampoco."
                    : "Sólo WhatsApp se cobra, y sólo cuando el negocio inicia la conversación. El email y las notificaciones son gratis."}
              </p>
            </CardBody>
          </Card>
        </section>
      </main>
    </>
  );
}
