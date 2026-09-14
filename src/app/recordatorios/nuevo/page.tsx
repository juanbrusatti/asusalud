import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { listTemplates } from "@/lib/data/recordatorios";
import { isEmailEnabled } from "@/lib/data/configuracion";
import { listServices } from "@/lib/data/services";
import { Constructor } from "../_components/constructor";

export const metadata: Metadata = { title: "Nueva regla" };

export default async function NuevaReglaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const [templates, services] = await Promise.all([
    listTemplates(),
    listServices(),
  ]);


  const correoDisponible = await isEmailEnabled();

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Nueva regla
        </h1>
        <Constructor
          correoDisponible={correoDisponible}
          templates={templates}
          services={services.filter((s) => s.is_active)}
          submitLabel="Guardar regla"
        />
      </main>
    </>
  );
}
