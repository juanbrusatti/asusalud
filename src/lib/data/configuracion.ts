import "server-only";

import { createClient } from "@/lib/supabase/server";
import { zonedTimeToUtc } from "@/lib/tz";
import type {
  Branch,
  BookingSettings,
  BusinessHour,
  MessagingSettings,
  Tenant,
} from "@/lib/configuracion";

// Se reexportan para que las pantallas pidan tipos y consultas del mismo
// lugar sin tener que saber cuál vive dónde.
export type {
  Branch,
  BookingSettings,
  BusinessHour,
  MessagingSettings,
  Tenant,
} from "@/lib/configuracion";
export { TIMEZONES, WEEKDAYS, toTimeInput } from "@/lib/configuracion";

export async function getTenant(): Promise<Tenant | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select("*").maybeSingle();
  return data;
}

export async function getBranch(): Promise<Branch | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  return data;
}

export async function getBusinessHours(): Promise<BusinessHour[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_hours")
    .select("*")
    .order("weekday")
    .order("opens_at");
  return data ?? [];
}

export async function getBookingSettings(): Promise<BookingSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("booking_settings")
    .select("*")
    .maybeSingle();
  return data;
}

export async function getMessagingSettings(): Promise<MessagingSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messaging_settings")
    .select("*")
    .maybeSingle();
  return data;
}


/**
 * Cuánto se gastó en mensajes en lo que va del mes.
 *
 * Un tope sin este número al lado es un número que se pone una vez y nunca más
 * se mira: no hay forma de saber si sobra o si está por cortar los envíos.
 *
 * El mes es el del negocio y no el del servidor. En Vercel el proceso corre en
 * UTC, así que a las 21:30 del último día del mes ya sería el mes siguiente y
 * el gasto se reiniciaría un día antes.
 */
export async function getMonthSpendCents(timeZone: string): Promise<number> {
  const ahora = new Date();
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  })
    .format(ahora)
    .split("-")
    .map(Number);

  const desde = zonedTimeToUtc(
    `${year}-${String(month).padStart(2, "0")}-01T00:00`,
    timeZone,
  );

  const supabase = await createClient();
  const { data } = await supabase
    .from("message_jobs")
    .select("cost_cents")
    .eq("status", "sent")
    .eq("was_test", false)
    .gte("sent_at", desde.toISOString());

  return (data ?? []).reduce((t, j) => t + Number(j.cost_cents ?? 0), 0);
}

/**
 * Si este negocio usa el correo como canal.
 *
 * Nace apagado. La interfaz lo usa para no ofrecer un canal que hoy no puede
 * entregar —falta el proveedor de correo—, que es peor que no ofrecerlo: se
 * elige, no llega, y nadie entiende por qué.
 */
export async function isEmailEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messaging_settings")
    .select("email_enabled")
    .maybeSingle();
  return data?.email_enabled === true;
}
