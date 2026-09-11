"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { zonedTimeToUtc } from "@/lib/tz";

export type FormState = {
  error: string | null;
  values?: Record<string, string>;
};

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

const schema = z.object({
  clientId: z.string().uuid("Elegí a quién le corresponde el turno."),
  serviceIds: z.array(z.string().uuid()).min(1, "Elegí al menos un servicio."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elegí una hora."),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Traduce los errores de la base a algo accionable.
 *
 * 23P01 lo levanta el trigger de cupos y su mensaje ya está escrito para que
 * lo lea una persona, así que se muestra tal cual.
 */
function friendly(error: { code?: string; message?: string }): string {
  if (error.code === "23P01") {
    return error.message ?? "Ese horario ya está completo.";
  }
  if (error.code === "42501") return "No tenés permiso para agendar acá.";
  if (error.code === "23514") {
    return "Los datos del turno no cierran. Revisá la hora y los servicios.";
  }
  return "No se pudo guardar el turno. Probá de nuevo en unos segundos.";
}

/**
 * Agenda un turno.
 *
 * La ventana (fin y bloqueo por limpieza) se calcula acá, que es donde se
 * conocen las duraciones. La base la verifica después con un trigger diferido:
 * si alguna vez esto escribe algo incoherente, la transacción falla en vez de
 * dejar un turno que ocupa mal la agenda.
 */
export async function createAppointment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({
    clientId: formData.get("clientId"),
    serviceIds: formData.getAll("serviceIds").map(String).filter(Boolean),
    date: formData.get("date"),
    time: formData.get("time"),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu estética." };

  const startsAt = zonedTimeToUtc(
    `${parsed.data.date}T${parsed.data.time}:00`,
    membership.tenant.timezone,
  );

  // Todo el trabajo lo hace la base en una sola transacción: calcula la
  // duración y el precio a partir de los servicios, escribe el turno y sus
  // servicios juntos, y recién ahí verifica que haya lugar.
  const supabase = await createClient();
  const { error } = await supabase.rpc("book_appointment", {
    p_client: parsed.data.clientId,
    p_service_ids: parsed.data.serviceIds,
    p_starts_at: startsAt.toISOString(),
    p_notes: parsed.data.notes,
  });

  if (error) return { error: friendly(error), values: echo(formData) };

  revalidatePath("/agenda");
  revalidatePath(`/clientes/${parsed.data.clientId}`);
  redirect(`/agenda?dia=${parsed.data.date}`);
}

/** Cambia el estado de un turno. Cada cambio queda en el historial. */
export async function setAppointmentStatus(
  id: string,
  status: Database["public"]["Enums"]["appointment_status"],
  reason?: string,
) {
  const supabase = await createClient();

  await supabase
    .from("appointments")
    .update({
      status,
      cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
      cancel_reason: status === "cancelled" ? (reason ?? null) : null,
    })
    .eq("id", id);

  revalidatePath("/agenda");
  revalidatePath(`/agenda/${id}`);
}

/** Mueve un turno a otro día u hora, conservando sus servicios. */
export async function rescheduleAppointment(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { error: "Elegí una fecha y una hora." };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu estética." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, blocks_until")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { error: "Ese turno ya no existe." };

  // Se conserva la duración: mover un turno no lo hace más corto ni más largo.
  const originalStart = new Date(current.starts_at).getTime();
  const length = new Date(current.ends_at).getTime() - originalStart;
  const block = new Date(current.blocks_until).getTime() - originalStart;

  const startsAt = zonedTimeToUtc(`${date}T${time}:00`, membership.tenant.timezone);

  const { error } = await supabase
    .from("appointments")
    .update({
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + length).toISOString(),
      blocks_until: new Date(startsAt.getTime() + block).toISOString(),
    })
    .eq("id", id);

  if (error) return { error: friendly(error) };

  revalidatePath("/agenda");
  revalidatePath(`/agenda/${id}`);
  redirect(`/agenda?dia=${date}`);
}

/** Bloquea un rato de la agenda: vacaciones, un feriado, el turno del médico. */
export async function createBlock(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const date = String(formData.get("date") ?? "");
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Elegí una fecha." };
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
    return { error: "Elegí desde qué hora hasta qué hora." };
  }
  if (to <= from) return { error: "La hora de fin tiene que ser posterior." };

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu estética." };

  const supabase = await createClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();

  if (!branch) return { error: "Tu estética no tiene una sucursal principal." };

  const tz = membership.tenant.timezone;
  const { error } = await supabase.from("agenda_blocks").insert({
    tenant_id: membership.tenantId,
    branch_id: branch.id,
    starts_at: zonedTimeToUtc(`${date}T${from}:00`, tz).toISOString(),
    ends_at: zonedTimeToUtc(`${date}T${to}:00`, tz).toISOString(),
    reason: reason || null,
  });

  if (error) return { error: friendly(error) };

  revalidatePath("/agenda");
  redirect(`/agenda?dia=${date}`);
}

export async function deleteBlock(id: string) {
  const supabase = await createClient();
  await supabase.from("agenda_blocks").delete().eq("id", id);
  revalidatePath("/agenda");
}
