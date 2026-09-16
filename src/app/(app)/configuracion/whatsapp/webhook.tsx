import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Copiable } from "@/components/ui/copiable";

/**
 * El último tramo del alta, que era el que trababa a todo el mundo.
 *
 * Sin esto los mensajes salen igual, pero las respuestas no vuelven: los tres
 * botones del recordatorio no hacen nada. El cliente aprieta «Confirmar» y del
 * lado del negocio no pasa nada.
 *
 * Antes la pantalla lo escondía como «opcional» y pedía inventar una palabra
 * de verificación, sin mostrar siquiera la dirección que hay que pegar en
 * Meta. Ahora los dos valores están acá, listos para copiar, con el camino
 * exacto de dónde van.
 */
export function Webhook({
  url,
  verifyToken,
  tieneFirma,
}: {
  url: string;
  verifyToken: string;
  tieneFirma: boolean;
}) {
  return (
    <Card>
      <CardBody className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Para que los botones funcionen</CardTitle>
          <span
            className={`rounded-pill px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider ${
              tieneFirma ? "bg-ok-wash text-ok" : "bg-warn-wash text-warn"
            }`}
          >
            {tieneFirma ? "Configurado" : "Falta"}
          </span>
        </div>

        <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
          Los recordatorios llevan tres botones: confirmar, cancelar y cambiar
          horario. Para que la respuesta vuelva y la agenda se actualice sola,
          Meta tiene que poder avisarnos. Se copian dos valores de acá y se
          pegan en Meta, una sola vez.
        </p>

        <div className="grid gap-4 rounded-card border-[1.5px] border-line bg-surface-2 p-4">
          <p className="text-[13px] leading-relaxed">
            En Meta, entrá a tu aplicación →{" "}
            <strong className="font-semibold">WhatsApp</strong> →{" "}
            <strong className="font-semibold">Configuración</strong> → en
            «Webhook», tocá{" "}
            <strong className="font-semibold">Editar</strong>.
          </p>

          <Copiable
            label="URL de devolución de llamada"
            valor={url}
            hint="Es la misma para todos los negocios. Meta la va a llamar cada vez que alguien conteste."
          />

          <Copiable
            label="Token de verificación"
            valor={verifyToken}
            hint="Sirve una sola vez, para que Meta y el sistema se reconozcan al conectarse. Se guarda solo al confirmar acá abajo."
          />

          <p className="text-[13px] leading-relaxed">
            Tocá{" "}
            <strong className="font-semibold">Verificar y guardar</strong>. Después,
            en la lista de campos, suscribite a{" "}
            <strong className="font-semibold">messages</strong> — sin ese, Meta
            no manda nada.
          </p>
        </div>

        {!tieneFirma && (
          <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] leading-snug text-ink">
            Falta además la <strong className="font-medium">clave secreta de
            la aplicación</strong>, que está en Meta en{" "}
            <em>Configuración de la app → Básica</em>. Se carga acá abajo, con
            el resto de las credenciales. Sin ella no se puede comprobar que
            cada aviso venga de verdad de Meta, y se descartan todos.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
