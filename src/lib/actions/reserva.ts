"use server";

import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

/** Horarios libres de un día. Devuelve instantes en ISO. */
export async function getSlots(
  slug: string,
  serviceIds: string[],
  date: string,
): Promise<string[]> {
  if (serviceIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_slots", {
    p_slug: slug,
    p_service_ids: serviceIds,
    p_date: date,
  });

  if (error) return [];
  return (data ?? []).map((r: { slot: string }) => r.slot);
}

const schema = z.object({
  firstName: z.string().trim().min(2, "Poné tu nombre."),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(6, "Hace falta un teléfono para poder avisarte."),
  email: z.string().trim().email("Ese correo no parece válido.").or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

export type BookingResult =
  | { ok: true; appointmentId: string; manageToken: string }
  | { ok: false; error: string };

export async function createBooking(input: {
  slug: string;
  serviceIds: string[];
  startsAt: string;
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  notes?: string;
}): Promise<BookingResult> {
  const parsed = schema.safeParse({
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: input.email ?? "",
    notes: input.notes,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  // El teléfono se normaliza acá y no en la base: es la misma función que usa
  // el resto del sistema, así que la ficha que se crea queda igual que
  // cualquier otra.
  const phone = normalizePhone(parsed.data.phone);
  if (!phone.e164) {
    return {
      ok: false,
      error: phone.error ?? "Revisá el teléfono: escribilo con característica.",
    };
  }

  if (input.serviceIds.length === 0) {
    return { ok: false, error: "Elegí al menos un servicio." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_create", {
    p_slug: input.slug,
    p_service_ids: input.serviceIds,
    p_starts_at: input.startsAt,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName ?? "",
    p_phone: phone.e164,
    p_email: parsed.data.email || undefined,
    p_notes: input.notes,
  });

  if (error) {
    return { ok: false, error: "No pudimos guardar tu turno. Probá de nuevo." };
  }

  const result = data as unknown as
    | { ok: true; appointmentId: string; manageToken: string }
    | { ok: false; error: string };

  return result;
}
