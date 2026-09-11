import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { createService } from "@/lib/actions/services";
import { listCategories } from "@/lib/data/services";
import { ServiceForm } from "../_components/service-form";

export const metadata: Metadata = { title: "Nuevo servicio" };

export default async function NuevoServicioPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  // La RLS lo rechazaría igual; esto evita mostrar un formulario que después
  // no va a poder guardarse.
  if (!atLeast(membership.role, "admin")) notFound();

  const categories = await listCategories();

  return (
    <>
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Nuevo servicio
        </h1>

        <ServiceForm
          action={createService}
          categories={categories}
          submitLabel="Crear servicio"
        />
      </main>
    </>
  );
}
