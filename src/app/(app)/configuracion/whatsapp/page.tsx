import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getWhatsappStatus } from "@/lib/data/whatsapp";
import { CALIDAD, ESTADOS } from "@/lib/whatsapp";
import { Volver } from "../_components/volver";
import { publicEnv } from "@/lib/env";
import { FormWhatsapp } from "./form";
import { Webhook } from "./webhook";
import { RevisionWhatsapp } from "./revision";

export const metadata: Metadata = { title: "WhatsApp" };

/** Lo que hay que tener a mano antes de empezar. Se dice antes, no después. */
const ANTES = [
  {
    titulo: "Un número nuevo, sólo para esto",
    detalle:
      "El número que conectes deja de funcionar en la aplicación de WhatsApp del teléfono. Si usás ese mismo número para hablar con tus clientes, vas a perder esa conversación. Conseguí uno aparte: un chip nuevo alcanza.",
  },
  {
    titulo: "Una tarjeta",
    detalle:
      "Meta cobra por mensaje enviado. El sistema manda primero por notificación y por correo, que son gratis, y deja WhatsApp para quien no tiene otra vía. Aun así, hace falta una tarjeta cargada para que Meta habilite el envío.",
  },
  {
    titulo: "No hace falta verificar la empresa para arrancar",
    detalle:
      "Sin verificación podés iniciar 250 conversaciones por día, que para la mayoría de los negocios sobra. La verificación recién hace falta si te quedás corto con eso.",
  },
];

const PASOS = [
  {
    titulo: "Creá tu cuenta de Meta Business",
    detalle:
      "En business.facebook.com, con tu usuario de Facebook. Es la cuenta desde la que Meta va a ver tu negocio.",
  },
  {
    titulo: "Creá una aplicación",
    detalle:
      "En developers.facebook.com, opción «Crear aplicación», y elegí el caso de uso de WhatsApp. Es el paso más técnico de todos.",
  },
  {
    titulo: "Agregá tu número y verificalo",
    detalle:
      "Meta te manda un código por SMS o por llamada al número nuevo. También vas a elegir el nombre con el que te van a ver tus clientes.",
  },
  {
    titulo: "Copiá el identificador del número",
    detalle:
      "Es una fila de números largos que Meta muestra como «Phone number ID». No es tu número de teléfono.",
  },
  {
    titulo: "Generá un token permanente",
    detalle:
      "En la configuración de tu cuenta de Meta Business, creá un usuario del sistema, dale acceso a tu aplicación y generá un token sin vencimiento. Los tokens que Meta muestra de entrada duran 24 horas y no sirven.",
  },
];

export default async function WhatsappPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const cuenta = await getWhatsappStatus();
  const estado = cuenta ? ESTADOS[cuenta.status] : null;

  /**
   * La palabra de verificación. Antes había que inventarla, que es justo
   * donde se traba quien no es técnico: no sabe qué poner ni para qué sirve.
   * Si todavía no hay ninguna se propone una y se guarda al confirmar.
   */
  const verifyToken =
    cuenta?.verify_token ?? `dlay-${crypto.randomUUID().replace(/-/g, "")}`;

  return (
    <>

      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <div>
          <Volver />
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
            WhatsApp
          </h1>
          <p className="mt-1 max-w-prose text-[14.5px] text-muted">
            Conectar tu número deja que los recordatorios salgan por WhatsApp
            cuando la persona no tiene correo o no lo mira. Es el canal más caro
            de los tres, así que el sistema lo usa último.
          </p>
        </div>

        {cuenta && estado && (
          <Card accent={cuenta.status === "connected"}>
            <CardBody className="grid gap-3">
              <CardTitle>{estado.titulo}</CardTitle>
              <p
                className={`text-[14px] leading-relaxed ${
                  cuenta.status === "connected" ? "opacity-90" : "text-muted"
                }`}
              >
                {estado.detalle}
              </p>

              <dl
                className={`grid gap-1.5 border-t-[1.5px] pt-3 text-[14px] ${
                  cuenta.status === "connected"
                    ? "border-white/25"
                    : "border-line"
                }`}
              >
                {[
                  ["Número", cuenta.display_phone ?? "Sin confirmar"],
                  [
                    "Calidad",
                    cuenta.quality_rating
                      ? (CALIDAD[cuenta.quality_rating] ?? cuenta.quality_rating)
                      : "Sin datos todavía",
                  ],
                  ["Puede iniciar por día", cuenta.messaging_limit ?? "250"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className={cuenta.status === "connected" ? "opacity-75" : "text-muted"}>
                      {k}
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        )}

        {!cuenta && (
          <>
            <Card>
              <CardBody className="grid gap-4">
                <CardTitle>Antes de empezar</CardTitle>
                <ul className="grid gap-3.5">
                  {ANTES.map((a) => (
                    <li key={a.titulo}>
                      <p className="text-[14.5px] font-medium">{a.titulo}</p>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                        {a.detalle}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="grid gap-4">
                <CardTitle>Los pasos del lado de Meta</CardTitle>
                <p className="-mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
                  Esta parte todavía se hace en la consola de Meta y es la más
                  incómoda de todo el sistema. Estamos trabajando para que sea
                  un solo botón; mientras tanto, así es el camino.
                </p>
                <ol className="grid gap-3.5">
                  {PASOS.map((p, i) => (
                    <li key={p.titulo} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12.5px] font-semibold text-on-accent">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-medium">
                          {p.titulo}
                        </span>
                        <span className="mt-0.5 block text-[13.5px] leading-relaxed text-muted">
                          {p.detalle}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          </>
        )}

        {cuenta && <RevisionWhatsapp />}

        {cuenta && (
          <Webhook
            url={`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`}
            verifyToken={verifyToken}
            tieneFirma={Boolean(cuenta.has_app_secret)}
          />
        )}

        <FormWhatsapp conectada={Boolean(cuenta)} verifyToken={verifyToken} />

        <p className="px-1 text-[12.5px] leading-relaxed text-faint">
          El token se guarda del lado del servidor, en una tabla que el panel
          no puede leer: una vez pegado no vuelve a mostrarse acá. Si lo
          perdés, generá uno nuevo en Meta y volvé a pegarlo.
        </p>
      </main>
    </>
  );
}
