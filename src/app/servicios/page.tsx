import Link from "next/link";
import type { Metadata } from "next";
import { Barra } from "@/app/_components/barra";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { listServices } from "@/lib/data/services";
import { ServiceList } from "./_components/service-list";

export const metadata: Metadata = { title: "Servicios" };

export default async function ServiciosPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  const services = await listServices();
  const canEdit = atLeast(membership.role, "admin");

  return (
    <>
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-4xl gap-5 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Servicios
            </h1>
            <p className="mt-1 max-w-prose text-[14.5px] text-muted">
              Lo que ofrece tu estética. De acá salen la duración de cada turno
              en la agenda, el precio que se cobra y lo que ven tus clientas al
              reservar online.
            </p>
          </div>

          {canEdit && (
            <Button asChild>
              <Link href="/servicios/nuevo">Nuevo servicio</Link>
            </Button>
          )}
        </header>

        {services.length === 0 ? (
          <EmptyState
            eyebrow="Todavía nada"
            title="Cargá tu primer servicio"
            action={
              canEdit ? (
                <Button asChild size="lg">
                  <Link href="/servicios/nuevo">Cargar un servicio</Link>
                </Button>
              ) : undefined
            }
          >
            <p>
              Un servicio es cada cosa que hacés: una depilación, una limpieza
              de cutis, un masaje. Cada uno tiene su duración, su precio y
              cuántas personas podés atender a la vez.
            </p>
            <p className="mt-2">
              Sin servicios cargados no se pueden agendar turnos, así que este
              es el primer paso.
            </p>
          </EmptyState>
        ) : (
          <ServiceList services={services} canEdit={canEdit} />
        )}
      </main>
    </>
  );
}
