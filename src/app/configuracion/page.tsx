import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Barra } from "@/app/_components/barra";
import { Card, CardBody } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getBookingSettings, getBusinessHours } from "@/lib/data/configuracion";
import { getWhatsappStatus } from "@/lib/data/whatsapp";

export const metadata: Metadata = { title: "Configuración" };

const SECCIONES = [
  {
    href: "/configuracion/negocio",
    titulo: "Tu negocio",
    detalle: "El nombre que ven tus clientes, la dirección y la zona horaria.",
  },
  {
    href: "/configuracion/horarios",
    titulo: "Horarios de atención",
    detalle:
      "Qué días y en qué franjas atendés. Es lo que decide qué horarios se ofrecen al reservar.",
  },
  {
    href: "/configuracion/reservas",
    titulo: "Reserva online",
    detalle:
      "Si tus clientes pueden sacar turno por su cuenta, con cuánta anticipación y hasta cuándo.",
  },
  {
    href: "/configuracion/whatsapp",
    titulo: "WhatsApp",
    detalle:
      "Conectá tu número para que los recordatorios puedan salir también por WhatsApp.",
  },
  {
    href: "/configuracion/mensajeria",
    titulo: "Envío de mensajes",
    detalle:
      "En qué franja se mandan los recordatorios y cuántos puede recibir cada persona.",
  },
];

export default async function ConfiguracionPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const [horarios, reservas, whatsapp] = await Promise.all([
    getBusinessHours(),
    getBookingSettings(),
    getWhatsappStatus(),
  ]);

  // Lo que está sin resolver se marca acá, así nadie tiene que entrar sección
  // por sección a ver qué falta.
  const pendientes: Record<string, string> = {};
  if (horarios.length === 0) {
    pendientes["/configuracion/horarios"] = "Sin horarios cargados";
  }
  if (!reservas?.enabled) {
    pendientes["/configuracion/reservas"] = "Agenda cerrada al público";
  }
  if (!whatsapp) {
    pendientes["/configuracion/whatsapp"] = "Sin conectar";
  }

  return (
    <>
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <header>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Configuración
          </h1>
          <p className="mt-1 max-w-prose text-[14.5px] text-muted">
            Cómo funciona tu negocio por dentro. Se toca poco y nada: la
            mayoría de esto se configura una vez.
          </p>
        </header>

        <ul className="grid gap-2">
          {SECCIONES.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex items-center gap-4 rounded-card border-[1.5px] border-line bg-surface px-4 py-3.5 hover:border-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[15px] font-semibold">{s.titulo}</p>
                    {pendientes[s.href] && (
                      <span className="rounded-pill bg-warn-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                        {pendientes[s.href]}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">
                    {s.detalle}
                  </p>
                </div>
                <span className="shrink-0 text-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>

        <Card>
          <CardBody className="grid gap-1.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
              WhatsApp
            </p>
            <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
              Conectar tu número de WhatsApp es un trámite aparte con Meta, y lo
              vamos a hacer juntos cuando llegue el momento. Mientras tanto, los
              recordatorios por correo funcionan igual.
            </p>
          </CardBody>
        </Card>
      </main>
    </>
  );
}
