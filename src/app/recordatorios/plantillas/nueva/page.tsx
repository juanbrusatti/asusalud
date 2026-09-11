import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { FormPlantilla } from "../form-plantilla";

export const metadata: Metadata = { title: "Nuevo mensaje" };

export default async function NuevaPlantillaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Nuevo mensaje
        </h1>
        <FormPlantilla submitLabel="Guardar mensaje" />
      </main>
    </>
  );
}
