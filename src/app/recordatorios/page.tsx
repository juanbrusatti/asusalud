import Link from "next/link";
import type { Metadata } from "next";
import { Barra } from "@/app/_components/barra";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFigure } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { formatPrice } from "@/lib/money";
import {
  CHANNEL_LABELS,
  getQueueSummary,
  getSettings,
  listRules,
  listUpcoming,
} from "@/lib/data/recordatorios";
import { timeIn } from "@/lib/tz";
import { Freno } from "./_components/freno";
import { ListaReglas } from "./_components/lista-reglas";

export const metadata: Metadata = { title: "Recordatorios" };

export default async function RecordatoriosPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  const [rules, settings, cola, proximos] = await Promise.all([
    listRules(),
    getSettings(),
    getQueueSummary(),
    listUpcoming(10),
  ]);

  const puedeEditar = atLeast(membership.role, "admin");
  const tz = membership.tenant.timezone;
  const activas = rules.filter((r) => r.enabled).length;

  const cuando = new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
  });

  return (
    <>
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-3xl gap-5 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Recordatorios
            </h1>
            <p className="mt-1 max-w-prose text-[14.5px] text-muted">
              Las reglas que avisan solas. Cada una dice cuándo, a quiénes y por
              qué canal, y siempre elige el más barato que la persona tenga.
            </p>
          </div>

          {puedeEditar && (
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/recordatorios/plantillas">Mensajes</Link>
              </Button>
              <Button asChild>
                <Link href="/recordatorios/nuevo">Nueva regla</Link>
              </Button>
            </div>
          )}
        </header>

        {settings && !settings.sending_enabled && (
          <Freno enabled={false} reason={settings.paused_reason} />
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardBody className="grid gap-1">
              <CardFigure>{cola.pending}</CardFigure>
              <p className="text-[12.5px] text-muted">
                en cola para salir
                {cola.plannedCents > 0 && ` · ${formatPrice(cola.plannedCents)}`}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="grid gap-1">
              <CardFigure>{cola.sent}</CardFigure>
              <p className="text-[12.5px] text-muted">
                enviados este mes · {formatPrice(cola.spentCents)}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="grid gap-1">
              <CardFigure>{cola.skipped}</CardFigure>
              <p className="text-[12.5px] text-muted">
                salteados por falta de canal o tope
              </p>
            </CardBody>
          </Card>
        </div>

        {rules.length === 0 ? (
          <EmptyState
            eyebrow="Todo a mano"
            title="Todavía no hay ninguna regla"
            action={
              puedeEditar ? (
                <Button asChild size="lg">
                  <Link href="/recordatorios/nuevo">Armar la primera</Link>
                </Button>
              ) : undefined
            }
          >
            <p>
              Una regla es una frase: <em>cuando falten 24 horas para el turno,
              avisarle por correo y, si no tiene, por WhatsApp</em>. La armás una
              vez y no la tocás más.
            </p>
            <p className="mt-2">
              Antes de activarla vas a ver a cuánta gente le llega y cuánto
              cuesta.
            </p>
          </EmptyState>
        ) : (
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                Reglas
              </h2>
              <p className="text-[13px] text-muted">
                {activas} {activas === 1 ? "activa" : "activas"} de{" "}
                {rules.length}
              </p>
            </div>
            <ListaReglas rules={rules} />
          </section>
        )}

        {proximos.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
              Próximos envíos
            </h2>
            <ul className="grid gap-2">
              {proximos.map((j) => {
                const nombre = j.client
                  ? [j.client.first_name, j.client.last_name]
                      .filter(Boolean)
                      .join(" ")
                  : "Sin clienta";
                const salteado = j.status === "skipped";

                return (
                  <li
                    key={j.id}
                    className={`flex items-center gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 py-3 ${
                      salteado ? "opacity-70" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium">
                        {nombre}
                      </p>
                      <p className="truncate text-[12.5px] text-muted">
                        {salteado
                          ? (j.skip_reason ?? "Salteado")
                          : `${j.rule?.name ?? "Regla"} · ${
                              j.channel ? CHANNEL_LABELS[j.channel] : "sin canal"
                            }`}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[13px] tabular-nums text-muted">
                        {cuando.format(new Date(j.scheduled_for))}{" "}
                        {timeIn(j.scheduled_for, tz)}
                      </p>
                      {j.cost_cents > 0 && (
                        <p className="text-[12px] tabular-nums text-faint">
                          {formatPrice(j.cost_cents)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {settings?.sending_enabled && puedeEditar && rules.length > 0 && (
          <div className="flex justify-end">
            <Freno enabled reason={null} />
          </div>
        )}
      </main>
    </>
  );
}
