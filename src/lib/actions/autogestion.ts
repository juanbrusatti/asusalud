"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Lo que puede hacer un cliente con su propio turno.
 *
 * Todo pasa por funciones de la base: acá no hay ninguna comprobación de si se
 * puede o no. La hora de corte, el tope de reprogramaciones y el estado del
 * turno los decide la base, que es la única que no se puede saltear cambiando
 * lo que viaja por la red.
 */

export type ManageResult = { ok: true } | { ok: false; error: string };

const GENERICO = "No se pudo hacer el cambio. Probá de nuevo en un minuto.";

function leer(data: unknown): ManageResult {
  const r = data as { ok?: boolean; error?: string } | null;
  if (r?.ok) return { ok: true };
  return { ok: false, error: r?.error ?? GENERICO };
}

/** Horarios libres de un día para mover este turno. */
export async function getManageSlots(
  token: string,
  date: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_manage_slots", {
    p_token: token,
    p_date: date,
  });

  if (error) return [];
  return (data ?? []).map((r: { slot: string }) => r.slot);
}

export async function confirmAppointment(token: string): Promise<ManageResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_confirm", {
    p_token: token,
  });

  if (error) return { ok: false, error: GENERICO };

  revalidatePath(`/t/${token}`);
  return leer(data);
}

export async function cancelAppointment(
  token: string,
  reason: string,
): Promise<ManageResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_cancel", {
    p_token: token,
    p_reason: reason.trim().slice(0, 200),
  });

  if (error) return { ok: false, error: GENERICO };

  revalidatePath(`/t/${token}`);
  // La agenda del equipo tiene que mostrar el hueco libre en la próxima
  // mirada, no cuando a la caché se le ocurra.
  revalidatePath("/agenda");
  return leer(data);
}

export async function rescheduleAppointment(
  token: string,
  startsAt: string,
): Promise<ManageResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_reschedule", {
    p_token: token,
    p_starts_at: startsAt,
  });

  if (error) return { ok: false, error: GENERICO };

  revalidatePath(`/t/${token}`);
  revalidatePath("/agenda");
  return leer(data);
}

/**
 * El cliente acepta las notificaciones de sus turnos.
 *
 * La llave es el token del turno, no un identificador de cliente: si un
 * visitante pudiera pasar el id que quisiera, cualquiera podría suscribir su
 * navegador a los recordatorios de otra persona.
 */
export async function subscribeClientPush(
  token: string,
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  },
): Promise<ManageResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_subscribe_push", {
    p_token: token,
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_user_agent: subscription.userAgent,
  });

  if (error) return { ok: false, error: "No pudimos activar los avisos." };
  return leer(data);
}
