"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

/**
 * El mensaje que este servicio le suma al recordatorio.
 *
 * Vive acá y no en Recordatorios a propósito: quien carga un servicio ya está
 * pensando en ese servicio —cuánto dura, cuánto sale, qué hay que saber antes
 * de venir—. Mandarla a otra pantalla a escribir la parte del mensaje rompe
 * ese hilo, y es la razón por la que el sistema anterior lo tenía junto.
 *
 * Lo que no puede vivir acá es el recordatorio entero: el saludo y la fecha
 * viajan en una plantilla aprobada por Meta, y esa aprobación es por trámite.
 * Por eso esta parte es libre e instantánea, y el marco se toca una vez.
 */

/** Lo que el sistema reemplaza al enviar. */
const VARIABLES = [
  ["{{cliente}}", "el nombre del cliente"],
  ["{{cuando}}", "la fecha y la hora del turno"],
  ["{{servicio}}", "qué se le hace"],
  ["{{estetica}}", "el nombre de tu negocio"],
] as const;

const EJEMPLO: Record<string, string> = {
  "{{cliente}}": "Mirián",
  "{{cuando}}": "lunes 14 de septiembre a las 09:00",
  "{{servicio}}": "depilación definitiva",
  "{{estetica}}": "Estética Asusalud",
  "{{fecha}}": "lunes 14 de septiembre",
  "{{hora}}": "09:00",
};

export function MensajeDelServicio({ defaultValue }: { defaultValue: string }) {
  const [texto, setTexto] = useState(defaultValue);

  const vistaPrevia = texto
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (hueco, key: string) =>
      EJEMPLO[`{{${key}}}`] ?? EJEMPLO[hueco] ?? "",
    )
    .replace(/ {2,}/g, " ")
    .trim();

  // Meta no acepta saltos de línea dentro de un parámetro. No los perdemos
  // —se convierten en un espacio antes de salir—, pero quien escribió los
  // renglones merece enterarse acá y no al ver el mensaje que llegó.
  const tieneRenglones = /\n/.test(texto.trim());

  return (
    <div className="grid gap-3">
      <Textarea
        label="Mensaje de este servicio"
        name="preparationNote"
        maxLength={300}
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="No te depiles con cera ni pinza 15 días antes, y vení sin cremas."
        hint="Lo que este servicio le suma al recordatorio. Si lo dejás vacío, el recordatorio sale igual, sin esta parte."
      />

      <div className="grid gap-1.5">
        <span className="text-[12.5px] font-medium text-muted">
          Tocá para insertar:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES.map(([token, que]) => (
            <button
              key={token}
              type="button"
              title={que}
              onClick={() => setTexto((t) => (t ? `${t} ${token}` : token))}
              className="rounded-pill border-[1.5px] border-line bg-surface px-2.5 py-1 font-mono text-[11.5px] text-accent-text hover:border-accent"
            >
              {token}
            </button>
          ))}
        </div>
      </div>

      {vistaPrevia && (
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-muted">
            Así le va a llegar:
          </span>
          <div className="rounded-[14px] bg-surface-2 px-3.5 py-2.5">
            <p className="text-[13.5px] leading-relaxed">
              {/* El marco es el de la plantilla, que se edita en
                  Recordatorios. Va apagado para que se lea qué parte está
                  escribiendo acá y cuál viene de allá. */}
              <span className="text-muted">
                Hola Mirián! Te recordamos tu turno en Estética Asusalud mañana
                lunes 14 de septiembre a las 09:00 para depilación definitiva.{" "}
              </span>
              <span className="text-ink">{vistaPrevia}</span>
            </p>
          </div>
          <p className="text-[12.5px] leading-snug text-muted">
            La parte gris es el recordatorio del día anterior y se cambia en
            Recordatorios. La negra es la de este servicio.
          </p>
        </div>
      )}

      {tieneRenglones && (
        <p
          role="status"
          className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] leading-snug text-ink"
        >
          En WhatsApp esto llega en un solo párrafo: Meta no admite renglones
          sueltos dentro de esta parte del mensaje. Se entiende igual, pero no
          va a verse separado como lo estás escribiendo.
        </p>
      )}
    </div>
  );
}
