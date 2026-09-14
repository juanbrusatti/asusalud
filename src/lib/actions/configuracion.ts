"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null; notice?: string | null };

function friendly(code: string | undefined): string {
  if (code === "42501") return "No tenés permiso para cambiar esto.";
  if (code === "23505") return "Ese nombre ya está en uso.";
  if (code === "23514") return "Algún valor quedó fuera de lo permitido.";
  return "No se pudo guardar. Probá de nuevo en unos segundos.";
}

// ---------------------------------------------------------------------------
// El negocio
// ---------------------------------------------------------------------------

const esteticaSchema = z.object({
  name: z.string().trim().min(2, "Poné el nombre del negocio."),
  timezone: z.string().trim().min(3),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
});

export async function saveEstetica(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = esteticaSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    address: String(formData.get("address") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("tenants")
    .update({ name: parsed.data.name, timezone: parsed.data.timezone })
    .eq("id", membership.tenantId);

  if (error) return { error: friendly(error.code) };

  await supabase
    .from("branches")
    .update({
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
    })
    .eq("is_default", true);

  revalidatePath("/configuracion", "layout");
  return { error: null, notice: "Guardado." };
}

// ---------------------------------------------------------------------------
// Horarios de atención
// ---------------------------------------------------------------------------

const HORA = /^\d{2}:\d{2}$/;

/**
 * Guarda los horarios de atención.
 *
 * Se borra todo y se vuelve a escribir: son pocas filas y así no hay que
 * reconciliar cuáles cambiaron, cuáles se agregaron y cuáles se sacaron. Todo
 * dentro del mismo pedido, así que la agenda nunca queda a medias.
 */
export async function saveHorarios(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const franjas = formData.getAll("franja").map(String);

  const parsed: Array<{ weekday: number; opens: string; closes: string }> = [];

  for (const franja of franjas) {
    const [dia, desde, hasta] = franja.split("|");
    const weekday = Number(dia);

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (!HORA.test(desde) || !HORA.test(hasta)) {
      return { error: "Revisá las horas: tienen que ser del tipo 09:00." };
    }
    if (hasta <= desde) {
      return {
        error: "Hay una franja que termina antes de empezar. Revisala.",
      };
    }
    parsed.push({ weekday, opens: desde, closes: hasta });
  }

  // Dos franjas del mismo día que se pisan dejarían horarios duplicados en la
  // reserva online.
  for (const dia of new Set(parsed.map((f) => f.weekday))) {
    const delDia = parsed
      .filter((f) => f.weekday === dia)
      .sort((a, b) => a.opens.localeCompare(b.opens));

    for (let i = 1; i < delDia.length; i += 1) {
      if (delDia[i].opens < delDia[i - 1].closes) {
        return {
          error: "Hay dos franjas del mismo día que se superponen.",
        };
      }
    }
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();

  if (!branch) return { error: "Tu negocio no tiene una sucursal principal." };

  const { error: borrado } = await supabase
    .from("business_hours")
    .delete()
    .eq("branch_id", branch.id);

  if (borrado) return { error: friendly(borrado.code) };

  if (parsed.length > 0) {
    const { error } = await supabase.from("business_hours").insert(
      parsed.map((f) => ({
        tenant_id: membership.tenantId,
        branch_id: branch.id,
        weekday: f.weekday,
        opens_at: f.opens,
        closes_at: f.closes,
      })),
    );
    if (error) return { error: friendly(error.code) };
  }

  revalidatePath("/configuracion/horarios");
  return { error: null, notice: "Horarios guardados." };
}

// ---------------------------------------------------------------------------
// Reserva online
// ---------------------------------------------------------------------------

const reservaSchema = z.object({
  enabled: z.boolean(),
  minAdvanceHours: z.number().int().min(0).max(720),
  maxDaysAhead: z.number().int().min(1).max(365),
  slotMinutes: z.number().int(),
  showPrices: z.boolean(),
  maxOpenPerClient: z.number().int().min(1).max(20),
  welcomeText: z.string().trim().max(400).optional(),
  addressNote: z.string().trim().max(200).optional(),
  selfManage: z.boolean(),
  cancelMinHours: z.number().int().min(0).max(168),
  maxReschedules: z.number().int().min(0).max(10),
  contactPhone: z.string().trim().max(30).optional(),
});

export async function saveReservas(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = reservaSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    minAdvanceHours: Number(formData.get("minAdvanceHours") ?? 2),
    maxDaysAhead: Number(formData.get("maxDaysAhead") ?? 60),
    slotMinutes: Number(formData.get("slotMinutes") ?? 15),
    showPrices: formData.get("showPrices") === "on",
    maxOpenPerClient: Number(formData.get("maxOpenPerClient") ?? 3),
    welcomeText: String(formData.get("welcomeText") ?? "").trim() || undefined,
    addressNote: String(formData.get("addressNote") ?? "").trim() || undefined,
    selfManage: formData.get("selfManage") === "on",
    cancelMinHours: Number(formData.get("cancelMinHours") ?? 24),
    maxReschedules: Number(formData.get("maxReschedules") ?? 2),
    contactPhone: String(formData.get("contactPhone") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_settings")
    .update({
      enabled: parsed.data.enabled,
      min_advance_hours: parsed.data.minAdvanceHours,
      max_days_ahead: parsed.data.maxDaysAhead,
      slot_minutes: parsed.data.slotMinutes,
      show_prices: parsed.data.showPrices,
      max_open_per_client: parsed.data.maxOpenPerClient,
      welcome_text: parsed.data.welcomeText ?? null,
      address_note: parsed.data.addressNote ?? null,
      self_manage: parsed.data.selfManage,
      cancel_min_hours: parsed.data.cancelMinHours,
      max_reschedules: parsed.data.maxReschedules,
      contact_phone: parsed.data.contactPhone
        ? (normalizePhone(parsed.data.contactPhone).e164 ??
          parsed.data.contactPhone)
        : null,
    })
    .eq("tenant_id", membership.tenantId);

  if (error) return { error: friendly(error.code) };

  revalidatePath("/configuracion/reservas");
  revalidatePath("/");
  return { error: null, notice: "Guardado." };
}

// ---------------------------------------------------------------------------
// Mensajería
// ---------------------------------------------------------------------------

const mensajeriaSchema = z
  .object({
    quietStart: z.string().regex(HORA),
    quietEnd: z.string().regex(HORA),
    maxPerDay: z.number().int().min(1).max(20),
    maxPerWeek: z.number().int().min(1).max(50),
    budgetPesos: z.number().min(0).nullable(),
  })
  .refine((v) => v.quietEnd > v.quietStart, {
    message: "La franja de envío termina antes de empezar.",
    path: ["quietEnd"],
  })
  .refine((v) => v.maxPerWeek >= v.maxPerDay, {
    message: "El tope semanal no puede ser menor que el diario.",
    path: ["maxPerWeek"],
  });

export async function saveMensajeria(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const presupuesto = String(formData.get("budgetPesos") ?? "").trim();

  const parsed = mensajeriaSchema.safeParse({
    quietStart: String(formData.get("quietStart") ?? ""),
    quietEnd: String(formData.get("quietEnd") ?? ""),
    maxPerDay: Number(formData.get("maxPerDay") ?? 2),
    maxPerWeek: Number(formData.get("maxPerWeek") ?? 5),
    budgetPesos: presupuesto === "" ? null : Number(presupuesto),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("messaging_settings")
    .update({
      quiet_start: parsed.data.quietStart,
      quiet_end: parsed.data.quietEnd,
      max_per_client_per_day: parsed.data.maxPerDay,
      max_per_client_per_week: parsed.data.maxPerWeek,
      monthly_budget_cents:
        parsed.data.budgetPesos === null
          ? null
          : Math.round(parsed.data.budgetPesos * 100),
    })
    .eq("tenant_id", membership.tenantId);

  if (error) return { error: friendly(error.code) };

  revalidatePath("/configuracion/mensajeria");
  revalidatePath("/recordatorios");
  return { error: null, notice: "Guardado." };
}
