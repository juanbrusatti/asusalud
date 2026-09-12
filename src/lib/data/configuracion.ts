import "server-only";

import { createClient } from "@/lib/supabase/server";
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

