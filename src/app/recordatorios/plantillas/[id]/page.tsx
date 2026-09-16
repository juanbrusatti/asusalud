import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { listTemplates } from "@/lib/data/recordatorios";
import { isEmailEnabled } from "@/lib/data/configuracion";
import { BorrarPlantilla } from "../borrar";
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

  const correoDisponible = await isEmailEnabled();

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {template.name}
        </h1>
        <FormPlantilla
          correoDisponible={correoDisponible}
          template={template}
          submitLabel="Guardar cambios"
        />

        {/* Fuera del formulario a propósito: acá nada de lo que se toque
            puede enviarlo sin querer. */}
        <div className="border-t-[1.5px] border-line pt-5">
          <BorrarPlantilla id={template.id} />
        </div>
      </main>
    </>
  );
}
