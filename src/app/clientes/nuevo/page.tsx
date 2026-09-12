import type { Metadata } from "next";
import { Barra } from "@/app/_components/barra";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { createClientAction } from "@/lib/actions/clients";
import { ClientForm } from "../_components/client-form";

export const metadata: Metadata = { title: "Nueva ficha" };

export default async function NuevoClientePage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Nueva ficha
        </h1>
        <ClientForm action={createClientAction} submitLabel="Crear ficha" />
      </main>
    </>
  );
}
