import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReglasWhatsapp } from "@/components/whatsapp/reglas";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { getConversaciones, ventanaEnPalabras } from "@/lib/data/mensajes";

export const metadata: Metadata = { title: "Mensajes" };

function cuando(iso: string): string {
  const fecha = new Date(iso);
  const minutos = Math.round((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < 60 * 24) return `hace ${Math.floor(minutos / 60)} h`;
  return fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export default async function MensajesPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;

  const conversaciones = await getConversaciones(membership.tenant.id);
  const sinResponder = conversaciones.filter((c) => c.sin_responder).length;

  return (
    <main className="mx-auto grid max-w-3xl gap-5 px-4 py-8">
      <header>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Mensajes
        </h1>
        <p className="mt-1 max-w-prose text-[14.5px] text-muted">
          {sinResponder > 0
            ? `${sinResponder} ${sinResponder === 1 ? "conversación espera" : "conversaciones esperan"} respuesta.`
            : "Lo que te escriben por WhatsApp. Los botones de confirmar y cancelar se contestan solos."}
        </p>
      </header>

      <ReglasWhatsapp />

      {conversaciones.length === 0 ? (
        <EmptyState eyebrow="Sin mensajes" title="Todavía no te escribió nadie">
          Acá van a aparecer las respuestas de tus clientas. Los botones de
          confirmar y cancelar se contestan solos y también se ven.
        </EmptyState>
      ) : (
        <div className="grid gap-2">
          {conversaciones.map((c) => (
            <Link key={c.telefono} href={`/mensajes/${c.telefono}`}>
              <Card>
                <CardBody className="grid gap-1 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-medium text-ink">
                      {c.nombre ?? `+${c.telefono}`}
                      {c.sin_responder && (
                        <span className="ml-2 rounded-pill bg-warn-wash px-2 py-0.5 text-[11.5px] font-semibold text-warn">
                          sin responder
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[12.5px] text-faint">
                      {cuando(c.ultimo_at)}
                    </span>
                  </div>

                  <p className="line-clamp-1 text-[13.5px] text-muted">
                    {c.ultimo_entrante ? "" : "Vos: "}
                    {c.ultimo_texto ?? "(sin texto)"}
                  </p>

                  <p className="text-[12px] text-faint">
                    {ventanaEnPalabras(c.ventana_hasta)}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
