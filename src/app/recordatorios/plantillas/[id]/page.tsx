import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { listTemplates } from "@/lib/data/recordatorios";
import { FormPlantilla } from "../form-plantilla";

export const metadata: Metadata = { title: "Editar mensaje" };

export default async function EditarPlantillaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  // La RLS ya filtró por negocio: si no está en la lista, no es de acá.
  const template = (await listTemplates()).find((t) => t.id === id);
  if (!template) notFound();

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {template.name}
        </h1>
        <FormPlantilla template={template} submitLabel="Guardar cambios" />
      </main>
    </>
  );
}
