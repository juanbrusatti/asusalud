import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { updateService } from "@/lib/actions/services";
import { getService, listCategories } from "@/lib/data/services";
import { ServiceForm } from "../_components/service-form";

export const metadata: Metadata = { title: "Editar servicio" };

export default async function EditarServicioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const [service, categories] = await Promise.all([
    getService(id),
    listCategories(),
  ]);

  // Si el servicio es de otra estética, la RLS ya devolvió null.
  if (!service) notFound();

  const action = updateService.bind(null, id);

  return (
    <>
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {service.name}
        </h1>

        <ServiceForm
          action={action}
          service={service}
          categories={categories}
          submitLabel="Guardar cambios"
        />
      </main>
    </>
  );
}
