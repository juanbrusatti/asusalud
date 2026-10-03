import { formatPriceExacto } from "@/lib/money";
import { COSTO_MENSAJE_META_CENTS } from "@/lib/precio";

/**
 * Las reglas de WhatsApp que el negocio tiene que tener presentes.
 *
 * No son reglas de Dlay sino de Meta, y por eso se dicen en cada pantalla
 * donde pesan y no sólo en el alta: quien conectó el número hace un mes ya no
 * se acuerda de que no puede escribirle a cualquiera cuando quiera, y lo
 * descubre cuando el cuadro de texto aparece apagado.
 */
export function ReglasWhatsapp({ costo = false }: { costo?: boolean }) {
  return (
    <aside className="grid gap-2 rounded-card border-[1.5px] border-line bg-surface-2 px-4 py-3.5 text-[13.5px] leading-relaxed">
      <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
        Cómo funciona WhatsApp
      </p>
      <ul className="grid gap-1.5 text-muted">
        <li>
          <strong className="font-semibold text-ink">
            24 horas para contestar.
          </strong>{" "}
          Podés escribirle a una clienta durante las 24 horas siguientes a su
          último mensaje. Después sólo salen los recordatorios aprobados, hasta
          que vuelva a escribir o toque Confirmar o Cancelar.
        </li>
        <li>
          <strong className="font-semibold text-ink">
            Este número es sólo para el sistema.
          </strong>{" "}
          El número conectado no funciona en la aplicación de WhatsApp del
          teléfono. Para hablar con alguien fuera de la ventana, usá tu número
          de siempre.
        </li>
        {costo && (
          <li>
            <strong className="font-semibold text-ink">
              Cada recordatorio lo cobra Meta.
            </strong>{" "}
            Hoy {formatPriceExacto(COSTO_MENSAJE_META_CENTS)} por mensaje, contra la
            tarjeta de tu cuenta de WhatsApp. Va aparte del abono de Dlay.
          </li>
        )}
      </ul>
    </aside>
  );
}
