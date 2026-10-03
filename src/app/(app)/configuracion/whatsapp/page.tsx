import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getWhatsappStatus } from "@/lib/data/whatsapp";
import { formatPriceExacto } from "@/lib/money";
import { COSTO_MENSAJE_META_CENTS } from "@/lib/precio";
import { CALIDAD, ESTADOS } from "@/lib/whatsapp";
import { Volver } from "../_components/volver";
import { publicEnv } from "@/lib/env";
import { Asistente } from "./asistente";
import { FormWhatsapp } from "./form";
import { Webhook } from "./webhook";
import { RevisionWhatsapp } from "./revision";

export const metadata: Metadata = { title: "WhatsApp" };

/** Lo que hay que tener a mano antes de empezar. Se dice antes, no después. */
const ANTES = [
  {
    titulo: "Dos números: uno para el sistema y otro para hablar",
    detalle:
      "El número que conectes deja de funcionar en la aplicación de WhatsApp del teléfono: sus mensajes dejan de aparecer ahí y pasan a este sistema. Por eso va un número para los mensajes automáticos —un chip nuevo alcanza— y seguís usando el de siempre para hablar con tus clientes como hasta hoy.",
  },
  {
    titulo: "Para contestar a mano tenés 24 horas",
    detalle:
      "Los botones de confirmar y cancelar se resuelven solos y te actualizan la agenda. Si además te escriben algo, lo leés y lo contestás desde Mensajes. Cuando un cliente te escribe se abre una ventana de 24 horas para responderle; pasado ese tiempo WhatsApp ya no deja escribirle, salvo con los recordatorios aprobados. Si te vuelve a escribir —o toca Confirmar o Cancelar— la ventana se abre de nuevo.",
  },
  {
    titulo: "Una tarjeta, para Meta",
    detalle: `Meta cobra cada mensaje que sale: hoy son ${formatPriceExacto(COSTO_MENSAJE_META_CENTS)} por recordatorio, contra la tarjeta que cargues en tu cuenta de WhatsApp. Eso va aparte del abono de Dlay y no pasa por nosotros. Sin una tarjeta cargada Meta no habilita el envío, así que este paso no se puede saltear.`,
  },
  {
    titulo: "Un rato tranquilo",
    detalle:
      "Son cinco pasos y lleva media hora la primera vez. El asistente se acuerda de dónde quedaste, así que podés cortar y seguir mañana sin perder nada.",
  },
  {
    titulo: "No hace falta verificar la empresa para arrancar",
    detalle:
      "Sin verificación podés iniciar 250 conversaciones por día, que para la mayoría de los negocios sobra. La verificación recién hace falta si te quedás corto con eso.",
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
                cuenta.status === "connected" ? "border-white/25" : "border-line"
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
                  <dt
                    className={
                      cuenta.status === "connected" ? "opacity-75" : "text-muted"
                    }
                  >
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

          <Asistente tenantId={membership.tenantId} verifyToken={verifyToken} />
        </>
      )}

      {cuenta && (
        <>
          <Webhook
            url={`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/whatsapp-webhook`}
            verifyToken={verifyToken}
            tieneFirma={Boolean(cuenta.has_app_secret)}
            tenantId={membership.tenantId}
          />

          <RevisionWhatsapp />

          <FormWhatsapp conectada verifyToken={verifyToken} />

          <p className="px-1 text-[12.5px] leading-relaxed text-faint">
            El token se guarda del lado del servidor, en una tabla que el panel
            no puede leer: una vez pegado no vuelve a mostrarse acá. Si lo
            perdés, generá uno nuevo en Meta y volvé a pegarlo.
          </p>
        </>
      )}
    </main>
  );
}
