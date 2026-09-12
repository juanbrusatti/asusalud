import type { PaymentMethod } from "@/lib/caja";
import type { Database } from "@/lib/supabase/types";

/**
 * Tipos y períodos de los informes.
 *
 * Vive fuera de `lib/data` porque el selector de período es un componente de
 * cliente y no puede arrastrar `next/headers` al navegador.
 */

export type MessageChannel = Database["public"]["Enums"]["message_channel"];

export type Report = {
  from: string;
  to: string;
  money: {
    incomeCents: number;
    expenseCents: number;
    byMethod: Array<{ method: PaymentMethod; cents: number }>;
  };
  agenda: {
    total: number;
    attended: number;
    noShow: number;
    cancelled: number;
    upcoming: number;
    online: number;
    bookedMinutes: number;
  };
  openMinutes: number;
  services: Array<{
    id: string | null;
    name: string;
    count: number;
    revenueCents: number;
    minutes: number;
  }>;
  reminders: {
    withReminder: { total: number; noShows: number };
    without: { total: number; noShows: number };
  };
  messages: {
    sent: number;
    costCents: number;
    byChannel: Array<{ channel: MessageChannel; count: number }>;
  };
};

export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  push: "Notificación",
  email: "Email",
  whatsapp: "WhatsApp",
};

export type Preset = "mes" | "mes-pasado" | "30-dias" | "ano";

export const PRESET_LABELS: Record<Preset, string> = {
  mes: "Este mes",
  "mes-pasado": "Mes pasado",
  "30-dias": "Últimos 30 días",
  ano: "Este año",
};

/** El orden en que aparecen los botones: de lo más mirado a lo menos. */
export const PRESETS: Preset[] = ["mes", "mes-pasado", "30-dias", "ano"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Suma días a una fecha ISO sin pasar por la zona horaria del servidor. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): string {
  // El día 0 del mes siguiente es el último del actual, incluidos los febreros.
  const d = new Date(Date.UTC(year, month + 1, 0));
  return d.toISOString().slice(0, 10);
}

export type Range = { from: string; to: string; preset: Preset | null };

/**
 * Qué período se está mirando.
 *
 * `hoy` llega como fecha de la estética, no del servidor: en Vercel el proceso
 * corre en UTC y a las 21:30 de Río Cuarto ya sería mañana, así que "este mes"
 * saltaría un día antes de tiempo.
 */
export function resolveRange(
  params: { preset?: string; desde?: string; hasta?: string },
  hoy: string,
): Range {
  if (params.desde && ISO.test(params.desde)) {
    const from = params.desde;
    const to =
      params.hasta && ISO.test(params.hasta) && params.hasta >= from
        ? params.hasta
        : from;
    return { from, to, preset: null };
  }

  const preset = (
    params.preset && params.preset in PRESET_LABELS ? params.preset : "mes"
  ) as Preset;

  const [year, month] = hoy.split("-").map(Number);

  switch (preset) {
    case "mes-pasado": {
      const prev = new Date(Date.UTC(year, month - 2, 1));
      const y = prev.getUTCFullYear();
      const m = prev.getUTCMonth();
      return {
        from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
        to: lastDayOfMonth(y, m),
        preset,
      };
    }
    case "30-dias":
      return { from: addDays(hoy, -29), to: hoy, preset };
    case "ano":
      return { from: `${year}-01-01`, to: hoy, preset };
    case "mes":
    default:
      return {
        from: `${hoy.slice(0, 7)}-01`,
        to: hoy,
        preset: "mes",
      };
  }
}

/** "Del 1 al 12 de septiembre" · "Del 1 de agosto al 12 de septiembre" */
export function describeRange(range: Range, locale = "es-AR"): string {
  const soloDia = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
  });
  const dia = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  });
  const diaAno = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const desde = new Date(`${range.from}T12:00:00Z`);
  const hasta = new Date(`${range.to}T12:00:00Z`);
  const mismoAno = range.from.slice(0, 4) === range.to.slice(0, 4);
  const mismoMes = range.from.slice(0, 7) === range.to.slice(0, 7);

  if (range.from === range.to) return `El ${diaAno.format(desde)}`;

  // Dentro del mismo mes no hace falta repetirlo: "del 1 al 12 de septiembre".
  const inicio = mismoMes ? soloDia.format(desde) : dia.format(desde);
  const fin = mismoAno ? dia.format(hasta) : diaAno.format(hasta);
  return `Del ${inicio} al ${fin}`;
}

/** Porcentaje entero, o null si no hay sobre qué calcularlo. */
export function share(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}
