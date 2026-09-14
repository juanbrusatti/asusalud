import Link from "next/link";
import type { Metadata } from "next";
import { Barra } from "@/app/_components/barra";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { listTemplates } from "@/lib/data/recordatorios";
import { CHANNEL_LABELS } from "@/lib/recordatorios";

export const metadata: Metadata = { title: "Mensajes" };

export default async function PlantillasPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  const templates = await listTemplates();
  const puedeEditar = atLeast(membership.role, "admin");

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              href="/recordatorios"
              className="text-[13px] text-muted hover:text-ink"
            >
              ← Recordatorios
            </Link>
            <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Mensajes
            </h1>
            <p className="mt-1 max-w-prose text-[14.5px] text-muted">
              Lo que reciben tus clientes. Cada canal necesita el suyo: lo que
              sirve en un correo no sirve en un WhatsApp.
            </p>
          </div>

          {puedeEditar && (
            <Button asChild>
              <Link href="/recordatorios/plantillas/nueva">Nuevo mensaje</Link>
            </Button>
          )}
        </header>

        {templates.length === 0 ? (
          <EmptyState
            eyebrow="Sin mensajes"
            title="Escribí el primero"
            action={
              puedeEditar ? (
                <Button asChild size="lg">
                  <Link href="/recordatorios/plantillas/nueva">
                    Escribir un mensaje
                  </Link>
                </Button>
              ) : undefined
            }
          >
            <p>
              Un mensaje es el texto que se envía, con huecos que el sistema
              completa: el nombre del cliente, la fecha y la hora de su turno.
            </p>
            <p className="mt-2">
              Los de WhatsApp además tienen que estar aprobados por Meta antes
              de poder usarse.
            </p>
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {templates.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/recordatorios/plantillas/${t.id}`}
                  className="grid gap-1 rounded-card border-[1.5px] border-line bg-surface px-4 py-3.5 hover:border-accent"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[15px] font-semibold">{t.name}</p>
                    <span className="rounded-pill bg-accent-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent-text">
                      {CHANNEL_LABELS[t.channel]}
                    </span>
                    {t.channel === "whatsapp" &&
                      t.provider_status !== "approved" && (
                        <span className="rounded-pill bg-warn-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                          Sin aprobar en Meta
                        </span>
                      )}
                    {t.category === "marketing" && (
                      <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                        Marketing
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-[13px] text-muted">{t.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
