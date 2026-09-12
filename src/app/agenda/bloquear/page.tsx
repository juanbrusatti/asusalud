import type { Metadata } from "next";
import { Barra } from "@/app/_components/barra";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { todayIn } from "@/lib/tz";
import { FormBloqueo } from "../_components/form-bloqueo";

export const metadata: Metadata = { title: "Bloquear agenda" };

export default async function BloquearPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const { dia } = await searchParams;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const tz = membership.tenant.timezone;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dia ?? "") ? dia! : todayIn(tz);

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-8">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Bloquear agenda
          </h1>
          <p className="mt-1 text-[14.5px] text-muted">
            Para los ratos en que no atendés: un feriado, el turno del médico,
            unas vacaciones.
          </p>
        </div>
        <FormBloqueo date={date} />
      </main>
    </>
  );
}
