import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { Card, CardBody, CardFigure, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { METHOD_LABELS } from "@/lib/caja";
import {
  getOpenSession,
  getTotals,
  listLooseMovements,
  listMovements,
  listSessions,
} from "@/lib/data/caja";
import { formatPrice } from "@/lib/money";
import { todayIn, zonedDayRange } from "@/lib/tz";
import { AbrirCaja } from "./_components/abrir";
import { CerrarCaja } from "./_components/cerrar";
import { ListaMovimientos } from "./_components/lista";
import { Movimiento } from "./_components/movimiento";

export const metadata: Metadata = { title: "Caja" };

export default async function CajaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  // Un profesional no ve la plata del negocio.
  if (membership.role === "staff") notFound();

  const tz = membership.tenant.timezone;
  const abierta = await getOpenSession();

  // Transferencias y Mercado Pago se pueden registrar con la caja cerrada:
  // no pasan por el cajón. Se muestran igual para que ningún cobro quede
  // guardado y en ninguna pantalla.
  const hoy = zonedDayRange(todayIn(tz), tz);
  const sueltos = await listLooseMovements(hoy.from, hoy.to);

  if (!abierta) {
    const cerradas = await listSessions(10);
    const [ultima, ...anteriores] = cerradas;
    const fecha = new Intl.DateTimeFormat("es-AR", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
    });

    return (
      <>
        <Barra tenantName={membership.tenant.name} />
        <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
          <header>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Caja
            </h1>
            <p className="mt-1 max-w-prose text-[14.5px] text-muted">
              Lo que entra y lo que sale, día por día. Al cerrar vas a saber si
              lo que hay en el cajón es lo que debería haber.
            </p>
          </header>

          {ultima && (
            <Card>
              <CardBody className="grid gap-3">
                <CardTitle>
                  Último cierre · {fecha.format(new Date(ultima.opened_at))}
                </CardTitle>

                <dl className="grid gap-1.5 text-[14.5px] tabular-nums">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Debería haber</dt>
                    <dd>{formatPrice(Number(ultima.expected_cents ?? 0))}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Se contó</dt>
                    <dd>{formatPrice(Number(ultima.counted_cents ?? 0))}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
                    <dt>Diferencia</dt>
                    <dd
                      className={
                        Number(ultima.difference_cents ?? 0) === 0
                          ? "text-accent-text"
                          : Number(ultima.difference_cents ?? 0) < 0
                            ? "text-danger"
                            : "text-warn"
                      }
                    >
                      {Number(ultima.difference_cents ?? 0) === 0
                        ? "Cuadró"
                        : `${Number(ultima.difference_cents) > 0 ? "+" : ""}${formatPrice(Number(ultima.difference_cents))}`}
                    </dd>
                  </div>
                </dl>

                {ultima.notes && (
                  <p className="text-[13px] leading-relaxed text-muted">
                    {ultima.notes}
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {sueltos.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                Cobros de hoy fuera de la caja
              </h2>
              <p className="-mt-1 max-w-prose text-[13px] leading-snug text-muted">
                Entraron sin pasar por el cajón, así que no se cuentan en el
                arqueo. Sí aparecen en los informes del período.
              </p>
              <ListaMovimientos
                movimientos={sueltos}
                timeZone={tz}
                puedeAnular={atLeast(membership.role, "reception")}
              />
            </section>
          )}

          <AbrirCaja />

          {anteriores.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                Cajas anteriores
              </h2>
              <ul className="grid gap-2">
                {anteriores.map((s) => {
                  const diferencia = Number(s.difference_cents ?? 0);
                  const cuadra = diferencia === 0;

                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-medium">
                          {fecha.format(new Date(s.opened_at))}
                        </p>
                        <p className="truncate text-[12.5px] text-muted">
                          {formatPrice(Number(s.counted_cents ?? 0))} contados
                          {s.notes && ` · ${s.notes}`}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 text-[13.5px] font-medium tabular-nums ${
                          cuadra
                            ? "text-muted"
                            : diferencia < 0
                              ? "text-danger"
                              : "text-warn"
                        }`}
                      >
                        {cuadra
                          ? "Cuadró"
                          : `${diferencia > 0 ? "+" : ""}${formatPrice(diferencia)}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </main>
      </>
    );
  }

  const [movimientos, totales] = await Promise.all([
    listMovements(abierta.id),
    getTotals(abierta.id),
  ]);

  const desde = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <header>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Caja
          </h1>
          <p className="mt-1 text-[14.5px] text-muted">
            Abierta desde el {desde.format(new Date(abierta.opened_at))} con{" "}
            {formatPrice(Number(abierta.opening_cents))}.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card accent>
            <CardBody className="grid gap-1">
              <CardFigure>{formatPrice(totales.incomeCents)}</CardFigure>
              <p className="text-[12.5px] opacity-80">
                cobrado en lo que va del día
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="grid gap-1">
              <CardFigure>{formatPrice(totales.expenseCents)}</CardFigure>
              <p className="text-[12.5px] text-muted">salidas</p>
            </CardBody>
          </Card>
        </div>

        {totales.byMethod.length > 0 && (
          <Card>
            <CardBody className="grid gap-2">
              <CardTitle>Por medio de pago</CardTitle>
              <dl className="grid gap-1.5 text-[14px] tabular-nums">
                {totales.byMethod.map((m) => (
                  <div key={m.method} className="flex justify-between gap-3">
                    <dt>{METHOD_LABELS[m.method]}</dt>
                    <dd className={m.cents < 0 ? "text-danger" : ""}>
                      {formatPrice(m.cents)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-[12.5px] leading-snug text-muted">
                Al cerrar sólo se cuenta el efectivo: lo demás no está en el
                cajón.
              </p>
            </CardBody>
          </Card>
        )}

        <Movimiento />

        {movimientos.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
              Movimientos del día
            </h2>
            <ListaMovimientos
              movimientos={movimientos}
              timeZone={tz}
              puedeAnular={atLeast(membership.role, "reception")}
            />
          </section>
        )}

        {sueltos.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
              Cobros de hoy fuera de la caja
            </h2>
            <p className="-mt-1 max-w-prose text-[13px] leading-snug text-muted">
              Entraron sin pasar por el cajón, así que no se cuentan en el
              arqueo. Sí aparecen en los informes del período.
            </p>
            <ListaMovimientos
              movimientos={sueltos}
              timeZone={tz}
              puedeAnular={atLeast(membership.role, "reception")}
            />
          </section>
        )}

        <CerrarCaja sessionId={abierta.id} />
      </main>
    </>
  );
}
