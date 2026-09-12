import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getBusinessHours, toTimeInput } from "@/lib/data/configuracion";
import { Volver } from "../_components/volver";
import { FormHorarios } from "./form";

export const metadata: Metadata = { title: "Horarios de atención" };

export default async function HorariosPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const horas = await getBusinessHours();

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-8">
        <div>
          <Volver />
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Horarios de atención
          </h1>
          <p className="mt-1 max-w-prose text-[14.5px] text-muted">
            Qué días y en qué franjas atendés. Es lo que decide qué horarios se
            le ofrecen a una clienta que reserva online.
          </p>
        </div>

        <FormHorarios
          franjas={horas.map((h) => ({
            weekday: h.weekday,
            opens: toTimeInput(h.opens_at),
            closes: toTimeInput(h.closes_at),
          }))}
        />
      </main>
    </>
  );
}
