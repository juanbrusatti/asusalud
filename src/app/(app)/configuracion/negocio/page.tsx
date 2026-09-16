import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getBranch, getTenant } from "@/lib/data/configuracion";
import { Volver } from "../_components/volver";
import { FormEstetica } from "./form";

export const metadata: Metadata = { title: "Tu negocio" };

export default async function EsteticaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const [tenant, branch] = await Promise.all([getTenant(), getBranch()]);
  if (!tenant) notFound();

  return (
    <>
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-8">
        <div>
          <Volver />
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Tu negocio
          </h1>
        </div>
        <FormEstetica tenant={tenant} branch={branch} />
      </main>
    </>
  );
}
