import type { Metadata } from "next";
import { isEmailEnabled } from "@/lib/data/configuracion";
import { notFound } from "next/navigation";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { FormPlantilla } from "../form-plantilla";

export const metadata: Metadata = { title: "Nuevo mensaje" };

export default async function NuevaPlantillaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();


  const correoDisponible = await isEmailEnabled();

  return (
    <>
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Nuevo mensaje
        </h1>
        <FormPlantilla correoDisponible={correoDisponible} submitLabel="Guardar mensaje" />
      </main>
    </>
  );
}
