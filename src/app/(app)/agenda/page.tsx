import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { getDay, getWeekCounts } from "@/lib/data/agenda";
import { todayIn, weekOf } from "@/lib/tz";
import { EnVivo } from "./_components/en-vivo";
import { ListaTurnos } from "./_components/lista-turnos";
import { TiraSemana } from "./_components/tira-semana";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const { dia } = await searchParams;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const tz = membership.tenant.timezone;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dia ?? "") ? dia! : todayIn(tz);

  const [{ appointments, blocks }, counts] = await Promise.all([
    getDay(date, tz),
    getWeekCounts(weekOf(date), tz),
  ]);

  const activos = appointments.filter((a) => a.status !== "cancelled");
  const cancelados = appointments.length - activos.length;

  return (
    <>

      <main className="mx-auto grid max-w-3xl gap-5 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Agenda
            </h1>
            <p className="mt-1 text-[14.5px] text-muted">
              {activos.length === 0
                ? "Sin turnos este día."
                : `${activos.length} ${activos.length === 1 ? "turno" : "turnos"}`}
              {cancelados > 0 && ` · ${cancelados} cancelado${cancelados === 1 ? "" : "s"}`}
            </p>
            <div className="mt-2">
              <EnVivo tenantId={membership.tenant.id} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/agenda/bloquear?dia=${date}`}>Bloquear</Link>
            </Button>
            <Button asChild>
              <Link href={`/agenda/nuevo?dia=${date}`}>Agendar turno</Link>
            </Button>
          </div>
        </header>

        <TiraSemana date={date} counts={counts} timeZone={tz} />

        {appointments.length === 0 && blocks.length === 0 ? (
          <EmptyState
            eyebrow="Día libre"
            title="No hay turnos agendados"
            action={
              <Button asChild size="lg">
                <Link href={`/agenda/nuevo?dia=${date}`}>Agendar turno</Link>
              </Button>
            }
          >
            <p>
              Cuando agendes un turno, acá vas a ver a quién atendés, qué le
              hacés y cuánto dura. Los turnos que se superponen se muestran
              juntos, agrupados por hora.
            </p>
          </EmptyState>
        ) : (
          <ListaTurnos
            appointments={appointments}
            blocks={blocks}
            timeZone={tz}
          />
        )}
      </main>
    </>
  );
}
