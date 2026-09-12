import type { Database } from "@/lib/supabase/types";

/**
 * Tipos y constantes de configuración.
 *
 * Vive fuera de `lib/data` a propósito: los formularios son componentes de
 * cliente y necesitan estas listas. Si las importaran del módulo de consultas,
 * arrastrarían `next/headers` al navegador y el build falla.
 */

export type Tenant = Database["public"]["Tables"]["tenants"]["Row"];
export type Branch = Database["public"]["Tables"]["branches"]["Row"];
export type BusinessHour = Database["public"]["Tables"]["business_hours"]["Row"];
export type BookingSettings =
  Database["public"]["Tables"]["booking_settings"]["Row"];
export type MessagingSettings =
  Database["public"]["Tables"]["messaging_settings"]["Row"];

/** Los días con el número que usa Postgres: 0 es domingo. */
export const WEEKDAYS: Array<{ value: number; label: string; short: string }> = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 0, label: "Domingo", short: "Dom" },
];

/**
 * Zonas horarias de Argentina más las de los países vecinos.
 *
 * No se ofrece la lista completa del mundo: son cuatrocientas y elegir mal
 * hace que los turnos aparezcan en el día equivocado.
 */
export const TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { value: "America/Argentina/Cordoba", label: "Córdoba" },
  { value: "America/Argentina/Mendoza", label: "Mendoza" },
  { value: "America/Argentina/Salta", label: "Salta" },
  { value: "America/Argentina/Tucuman", label: "Tucumán" },
  { value: "America/Argentina/Ushuaia", label: "Ushuaia" },
  { value: "America/Montevideo", label: "Montevideo (Uruguay)" },
  { value: "America/Santiago", label: "Santiago (Chile)" },
  { value: "America/Asuncion", label: "Asunción (Paraguay)" },
  { value: "America/Sao_Paulo", label: "São Paulo (Brasil)" },
];

/** "09:00:00" → "09:00". Postgres devuelve los segundos y el input no los quiere. */
export function toTimeInput(value: string): string {
  return value.slice(0, 5);
}
