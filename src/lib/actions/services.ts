"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parsePriceToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth/tenant";

/**
 * React 19 resetea el formulario cuando la acción termina, así que un error de
 * validación borraría todo lo que la persona escribió. Por eso el estado
 * devuelve los valores enviados: el formulario los vuelve a pintar.
 */
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

const schema = z
  .object({
    name: z.string().trim().min(2, "Poné el nombre del servicio."),
    description: z.string().trim().max(500).optional(),
    preparationNote: z.string().trim().max(600).optional(),
    categoryId: z.string().uuid().nullable(),
    durationMinutes: z
      .number()
      .int()
      .min(5, "La duración mínima es 5 minutos.")
      .max(600, "La duración máxima es 10 horas."),
    bufferMinutes: z
      .number()
      .int()
      .min(0)
      .max(120, "El tiempo de preparación no puede pasar de 2 horas."),
    capacity: z
      .number()
      .int()
      .min(1, "Tiene que admitir al menos un turno.")
      .max(50, "Cincuenta turnos simultáneos es demasiado."),
    onRequest: z.boolean(),
    priceCents: z.number().int().min(0).nullable(),
    isActive: z.boolean(),
    isBookableOnline: z.boolean(),
  })
  .refine((v) => v.onRequest || v.priceCents !== null, {
    message: 'Poné un precio, o marcá el servicio como "a convenir".',
    path: ["priceCents"],
  });

function toNumber(value: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function read(formData: FormData) {
  const onRequest = formData.get("onRequest") === "on";
  const rawPrice = String(formData.get("price") ?? "");

  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
    preparationNote:
      String(formData.get("preparationNote") ?? "").trim() || undefined,
    categoryId: (String(formData.get("categoryId") ?? "") || null) as
      | string
      | null,
    durationMinutes: toNumber(formData.get("durationMinutes"), 30),
    bufferMinutes: toNumber(formData.get("bufferMinutes"), 0),
    capacity: toNumber(formData.get("capacity"), 1),
    onRequest,
    priceCents: onRequest ? null : parsePriceToCents(rawPrice),
    isActive: formData.get("isActive") === "on",
    isBookableOnline: formData.get("isBookableOnline") === "on",
  };
}

function toRow(v: z.infer<typeof schema>) {
  return {
    name: v.name,
    description: v.description ?? null,
    preparation_note: v.preparationNote ?? null,
    category_id: v.categoryId,
    duration_minutes: v.durationMinutes,
    buffer_minutes: v.bufferMinutes,
    capacity: v.capacity,
    price_mode: v.onRequest ? ("on_request" as const) : ("fixed" as const),
    price_cents: v.onRequest ? null : v.priceCents,
    is_active: v.isActive,
    is_bookable_online: v.isBookableOnline,
  };
}

/** Traduce los errores de la base a algo que una persona pueda accionar. */
function friendly(code: string | undefined, name: string): string {
  if (code === "23505") return `Ya existe un servicio llamado "${name}".`;
  if (code === "42501")
    return "No tenés permiso para modificar el catálogo de servicios.";
  return "No se pudo guardar. Probá de nuevo en unos segundos.";
}

export async function createService(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse(read(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .insert({ tenant_id: membership.tenantId, ...toRow(parsed.data) });

  if (error) {
    return { error: friendly(error.code, parsed.data.name), values: echo(formData) };
  }

  revalidatePath("/servicios");
  redirect("/servicios");
}

export async function updateService(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse(read(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update(toRow(parsed.data))
    .eq("id", id);

  if (error) {
    return { error: friendly(error.code, parsed.data.name), values: echo(formData) };
  }

  revalidatePath("/servicios");
  redirect("/servicios");
}

/**
 * Los servicios no se borran: se desactivan. Los turnos históricos los siguen
 * referenciando, y borrar uno dejaría la caja y los informes sin explicación.
 */
export async function toggleService(id: string, isActive: boolean) {
  const supabase = await createClient();
  await supabase.from("services").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/servicios");
}
