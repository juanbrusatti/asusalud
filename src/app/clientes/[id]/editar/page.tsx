import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { updateClientAction } from "@/lib/actions/clients";
import { fullName, getClient } from "@/lib/data/clients";
import { ClientForm } from "../../_components/client-form";

export const metadata: Metadata = { title: "Editar ficha" };

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const client = await getClient(id);
  if (!client) notFound();

  const action = updateClientAction.bind(null, id);

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          {fullName(client)}
        </h1>
        <ClientForm
          action={action}
          client={client}
          submitLabel="Guardar cambios"
        />
      </main>
    </>
  );
}
