import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getMessagingSettings, toTimeInput } from "@/lib/data/configuracion";
import { Volver } from "../_components/volver";
import { FormMensajeria } from "./form";

export const metadata: Metadata = { title: "Envío de mensajes" };

export default async function MensajeriaPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const settings = await getMessagingSettings();
  if (!settings) notFound();

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-8">
        <div>
          <Volver />
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Envío de mensajes
          </h1>
          <p className="mt-1 max-w-prose text-[14.5px] text-muted">
            Los límites que ninguna regla de recordatorio puede saltear. Están
            para que un error de configuración no termine en un cliente
            recibiendo diez mensajes.
          </p>
        </div>

        <FormMensajeria
          settings={settings}
          quietStart={toTimeInput(settings.quiet_start)}
          quietEnd={toTimeInput(settings.quiet_end)}
        />
      </main>
    </>
  );
}
