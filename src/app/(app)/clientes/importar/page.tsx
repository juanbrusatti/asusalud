import type { Metadata } from "next";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { Importador } from "./_components/importador";

export const metadata: Metadata = { title: "Importar clientes" };

export default async function ImportarPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  return (
    <>
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Importar clientes
        </h1>
        <Importador />
      </main>
    </>
  );
}
