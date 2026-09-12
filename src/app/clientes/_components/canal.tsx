"use client";

import { useTransition } from "react";
import { setChannelModeAction } from "@/lib/actions/clients";
import type { Database } from "@/lib/supabase/types";

type Mode = Database["public"]["Enums"]["channel_mode"];

const OPCIONES: Array<{ value: Mode; label: string }> = [
  { value: "auto", label: "Automático" },
  { value: "email", label: "Correo" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "none", label: "Ninguno" },
];

/**
 * Triage de canal: un toque y queda decidido para siempre.
 *
 * La idea es que nadie se siente a clasificar seis mil fichas. Esto aparece
 * mientras se trabaja con la persona, se resuelve en un toque, y en dos meses
 * toda la clientela activa queda clasificada sin que haya hecho falta una
 * tarde dedicada a eso.
 */
export function SelectorCanal({
  clientId,
  mode,
  hasEmail,
  hasPhone,
}: {
  clientId: string;
  mode: Mode;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const disponible = (value: Mode) =>
    value === "email" ? hasEmail : value === "whatsapp" ? hasPhone : true;

  return (
    <div className="grid gap-2">
      <div
        role="group"
        aria-label="Por dónde recibe los recordatorios"
        className="flex flex-wrap gap-1.5"
      >
        {OPCIONES.map((o) => {
          const activo = mode === o.value;
          const puede = disponible(o.value);
          return (
            <button
              key={o.value}
              type="button"
              disabled={pending || !puede}
              aria-pressed={activo}
              title={
                puede
                  ? undefined
                  : o.value === "email"
                    ? "Esta ficha no tiene correo cargado."
                    : "Esta ficha no tiene teléfono cargado."
              }
              onClick={() =>
                startTransition(() => {
                  void setChannelModeAction(clientId, o.value);
                })
              }
              className={`rounded-pill border-[1.5px] px-3.5 py-1.5 text-[13px] font-medium disabled:opacity-40 ${
                activo
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <p className="text-[12.5px] leading-snug text-muted">
        {mode === "auto" &&
          "Elige solo el canal más barato que esta persona tenga disponible."}
        {mode === "email" &&
          "Siempre por correo, aunque tenga WhatsApp. No cuesta nada."}
        {mode === "whatsapp" &&
          "Siempre por WhatsApp. Cada mensaje tiene un costo, usalo cuando el correo no funcione."}
        {mode === "none" &&
          "No recibe recordatorios automáticos de ningún tipo."}
      </p>
    </div>
  );
}
