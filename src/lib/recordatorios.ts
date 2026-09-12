import type { Database } from "@/lib/supabase/types";

/**
 * Tipos y etiquetas del motor de recordatorios.
 *
 * Vive fuera de `lib/data` a propósito: el constructor de reglas es un
 * componente de cliente y necesita estas constantes. Si las importara desde el
 * módulo de consultas, arrastraría `next/headers` al navegador y el build
 * falla.
 */

export type Rule = Database["public"]["Tables"]["reminder_rules"]["Row"];
export type Template = Database["public"]["Tables"]["message_templates"]["Row"];
export type MessagingSettings =
  Database["public"]["Tables"]["messaging_settings"]["Row"];
export type Channel = Database["public"]["Enums"]["message_channel"];
export type Trigger = Database["public"]["Enums"]["reminder_trigger"];

export type RuleWithTemplates = Rule & {
  rule_templates: Array<{ channel: Channel; template_id: string }>;
};

export type Simulation = Array<{
  channel: Channel | null;
  recipients: number;
  cost_cents: number;
}>;

export const CHANNEL_LABELS: Record<Channel, string> = {
  push: "Notificación",
  email: "Correo",
  whatsapp: "WhatsApp",
};

export const TRIGGER_LABELS: Record<Trigger, string> = {
  before_appointment: "Antes del turno",
  after_appointment: "Después del turno",
  birthday: "El día del cumpleaños",
  no_activity: "Cuando hace mucho que no viene",
};

/**
 * Los desfases que una estética realmente usa. El campo acepta cualquier
 * número, pero ofrecer los habituales evita que alguien tenga que calcular
 * cuántos minutos son siete días.
 */
export const OFFSET_PRESETS: Array<{ minutes: number; label: string }> = [
  { minutes: -20160, label: "14 días antes" },
  { minutes: -10080, label: "7 días antes" },
  { minutes: -4320, label: "3 días antes" },
  { minutes: -1440, label: "24 horas antes" },
  { minutes: -180, label: "3 horas antes" },
  { minutes: -120, label: "2 horas antes" },
  { minutes: 1440, label: "1 día después" },
  { minutes: 4320, label: "3 días después" },
];

/** -1440 → "24 horas antes". Sirve para cualquier número, no sólo los atajos. */
export function describeOffset(minutes: number): string {
  const preset = OFFSET_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;

  const abs = Math.abs(minutes);
  const cuando = minutes < 0 ? "antes" : "después";

  if (abs % 1440 === 0) {
    const dias = abs / 1440;
    return `${dias} ${dias === 1 ? "día" : "días"} ${cuando}`;
  }
  if (abs % 60 === 0) {
    const horas = abs / 60;
    return `${horas} ${horas === 1 ? "hora" : "horas"} ${cuando}`;
  }
  return `${abs} minutos ${cuando}`;
}

/**
 * El signo del desfase tiene que coincidir con el disparador, y la base lo
 * exige. Se normaliza acá para que nadie tenga que pensarlo: "24 horas antes"
 * se escribe como un número positivo y se guarda negativo.
 */
export function normalizeOffset(trigger: Trigger, minutes: number): number {
  const abs = Math.abs(minutes);
  if (trigger === "before_appointment") return -abs;
  if (trigger === "after_appointment" || trigger === "no_activity") return abs;
  return 0;
}
