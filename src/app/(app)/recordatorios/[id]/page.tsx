import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getRule, listTemplates } from "@/lib/data/recordatorios";
import { isEmailEnabled } from "@/lib/data/configuracion";
import { listServices } from "@/lib/data/services";
import { Constructor } from "../_components/constructor";

export const metadata: Metadata = { title: "Editar regla" };

export default async function EditarReglaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const [rule, templates, services] = await Promise.all([
    getRule(id),
    listTemplates(),
    listServices(),
  ]);

  if (!rule) notFound();


  const correoDisponible = await isEmailEnabled();

  return (
    <>
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {rule.name}
        </h1>
        <Constructor
          correoDisponible={correoDisponible}
          rule={rule}
          templates={templates}
          services={services.filter((s) => s.is_active)}
          submitLabel="Guardar cambios"
        />
      </main>
    </>
  );
}
