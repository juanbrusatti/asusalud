"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export type FormState = {
  error: string | null;
  notice?: string | null;
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
  firstName: z.string().trim().min(1, "Poné al menos el nombre."),
  lastName: z.string().trim().max(80).optional(),
  phoneRaw: z.string().trim().max(40).optional(),
  isLandline: z.boolean(),
  email: z
    .string()
    .trim()
    .email("Ese correo no parece válido.")
    .optional()
    .or(z.literal("")),
  documentId: z.string().trim().max(30).optional(),
  birthdate: z.string().trim().optional(),
  alert: z.string().trim().max(300).optional(),
  channelMode: z.enum(["auto", "email", "whatsapp", "none"]),
});

function read(formData: FormData) {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? "").trim() || undefined,
    phoneRaw: String(formData.get("phoneRaw") ?? "").trim() || undefined,
    isLandline: formData.get("isLandline") === "on",
    email: String(formData.get("email") ?? "").trim(),
    documentId: String(formData.get("documentId") ?? "").trim() || undefined,
    birthdate: String(formData.get("birthdate") ?? "").trim() || undefined,
    alert: String(formData.get("alert") ?? "").trim() || undefined,
    channelMode: String(formData.get("channelMode") ?? "auto"),
  };
}

type Parsed = z.infer<typeof schema>;

function toRow(v: Parsed) {
  const phone = v.phoneRaw
    ? normalizePhone(v.phoneRaw, { isMobile: !v.isLandline })
    : null;

  return {
    row: {
      first_name: v.firstName,
      last_name: v.lastName ?? null,
      phone_raw: v.phoneRaw ?? null,
      phone_e164: phone?.e164 ?? null,
      email: v.email ? v.email : null,
      document_id: v.documentId ?? null,
      birthdate: v.birthdate || null,
      alert: v.alert ?? null,
      channel_mode: v.channelMode,
    },
    phone,
  };
}

function friendly(code: string | undefined): string {
  if (code === "42501") return "No tenés permiso para hacer eso.";
  if (code === "23514")
    return "Algún dato quedó fuera de rango. Revisá el teléfono y el correo.";
  return "No se pudo guardar. Probá de nuevo en unos segundos.";
}

export async function createClientAction(
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

  const { row, phone } = toRow(parsed.data);

  // Un teléfono que no se entiende no se guarda a medias: se avisa y se
  // corrige. Un número mal guardado es un recordatorio que nunca llega.
  if (phone?.error) {
    return { error: phone.error, values: echo(formData) };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ tenant_id: membership.tenantId, ...row })
    .select("id")
    .single();

  if (error) return { error: friendly(error.code), values: echo(formData) };

  revalidatePath("/clientes");
  redirect(`/clientes/${data.id}`);
}

export async function updateClientAction(
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

  const { row, phone } = toRow(parsed.data);
  if (phone?.error) {
    return { error: phone.error, values: echo(formData) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(row).eq("id", id);

  if (error) return { error: friendly(error.code), values: echo(formData) };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect(`/clientes/${id}`);
}

/** Las notas se suman, nunca se editan: son el registro de lo que pasó. */
export async function addNoteAction(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const body = String(formData.get("body") ?? "").trim();

  if (body.length < 3) {
    return { error: "Escribí un poco más para que la nota sirva." };
  }
  if (body.length > 2000) {
    return { error: "La nota es demasiado larga." };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("client_notes").insert({
    tenant_id: membership.tenantId,
    client_id: clientId,
    body,
    author_id: user?.id ?? null,
  });

  if (error) return { error: friendly(error.code) };

  revalidatePath(`/clientes/${clientId}`);
  return { error: null, notice: "Nota guardada." };
}

/** Triage de canal: un toque desde la ficha y queda decidido. */
export async function setChannelModeAction(
  clientId: string,
  mode: "auto" | "email" | "whatsapp" | "none",
) {
  const supabase = await createClient();
  await supabase
    .from("clients")
    .update({ channel_mode: mode })
    .eq("id", clientId);

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

export async function toggleTagAction(
  clientId: string,
  tagId: string,
  assign: boolean,
) {
  const membership = await getCurrentTenant();
  if (!membership) return;

  const supabase = await createClient();

  if (assign) {
    await supabase.from("client_tag_assignments").insert({
      tenant_id: membership.tenantId,
      client_id: clientId,
      tag_id: tagId,
    });
  } else {
    await supabase
      .from("client_tag_assignments")
      .delete()
      .eq("client_id", clientId)
      .eq("tag_id", tagId);
  }

  revalidatePath(`/clientes/${clientId}`);
}

export async function createTagAction(
  clientId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();

  if (name.length < 2) return { error: "La etiqueta necesita un nombre." };
  if (name.length > 40) return { error: "El nombre es demasiado largo." };

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_tags")
    .insert({ tenant_id: membership.tenantId, name })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: `Ya existe la etiqueta "${name}".` };
    return { error: friendly(error.code) };
  }

  await supabase.from("client_tag_assignments").insert({
    tenant_id: membership.tenantId,
    client_id: clientId,
    tag_id: data.id,
  });

  revalidatePath(`/clientes/${clientId}`);
  return { error: null, notice: `Etiqueta "${name}" creada.` };
}
