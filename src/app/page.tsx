import Link from "next/link";
import { Barra } from "@/app/_components/barra";
import { Button } from "@/components/ui/button";
import { CrearEstetica } from "@/app/_components/crear-estetica";
import { Notificaciones } from "@/components/pwa/notificaciones";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { Card, CardBody, CardFigure, CardTitle } from "@/components/ui/card";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth/tenant";
import { publicEnv } from "@/lib/env";

const ROLES: Record<string, string> = {
  owner: "Dueña",
  admin: "Administración",
  reception: "Recepción",
  staff: "Profesional",
};

export default async function InicioPage() {
  // El middleware ya garantiza que hay sesión; esto es sólo para el saludo.
  const [user, membership] = await Promise.all([
    getCurrentUser(),
    getCurrentTenant(),
  ]);

  if (!membership) {
    return (
      <>
        <RegisterServiceWorker />
        <main className="mx-auto grid min-h-dvh max-w-4xl place-items-center px-4 py-10">
          <CrearEstetica />
        </main>
      </>
    );
  }

  const nombre = user?.user_metadata?.full_name?.split(" ")[0] ?? "Hola";

  return (
    <>
      <RegisterServiceWorker />
      <Barra tenantName={membership.tenant.name} />

      <main className="mx-auto grid max-w-4xl gap-5 px-4 py-8">
        <div>
          <p className="font-hand text-[42px] leading-none text-accent-text">
            Hola {nombre}
          </p>
          <p className="mt-1.5 text-[15px] text-muted">
            Tu estética ya está creada. Los módulos llegan en la próxima etapa.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card accent>
            <CardBody className="grid gap-1.5">
              <CardFigure>{ROLES[membership.role] ?? membership.role}</CardFigure>
              <p className="text-[13.5px] opacity-80">
                Tu rol en {membership.tenant.name}. Define qué podés ver y qué
                podés cambiar.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="grid gap-1.5">
              <CardTitle>Zona horaria</CardTitle>
              <p className="text-[14.5px] text-muted">
                {membership.tenant.timezone}
              </p>
              <p className="text-[13px] leading-relaxed text-faint">
                Con esta zona se calcula cuándo empieza y termina cada día, y a
                qué hora sale cada recordatorio.
              </p>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody className="grid justify-items-start gap-2">
            <CardTitle>Tu día</CardTitle>
            <p className="max-w-prose text-[14.5px] leading-relaxed text-muted">
              La agenda muestra a quién atendés hoy, qué le hacés y cuánto dura.
              Los turnos que se superponen se agrupan por hora.
            </p>
            <Button asChild className="mt-1">
              <Link href="/agenda">Ver la agenda</Link>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>Avisos en este dispositivo</CardTitle>
            <Notificaciones
              vapidPublicKey={publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-2">
            <CardTitle>Lo que viene</CardTitle>
            <ul className="grid gap-1.5 text-[14.5px] text-muted">
              <li>· Recordatorios automáticos por correo y WhatsApp.</li>
              <li>· Reserva online para tus clientas.</li>
              <li>· Caja, señas e informes.</li>
            </ul>
          </CardBody>
        </Card>
      </main>
    </>
  );
}
