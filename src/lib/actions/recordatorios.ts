"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { createClient } from "@/lib/supabase/server";
import type { Channel, Simulation, Trigger } from "@/lib/data/recordatorios";

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

const CHANNELS = ["push", "email", "whatsapp"] as const;
const TRIGGERS = [
  "before_appointment",
  "after_appointment",
  "birthday",
  "no_activity",
] as const;

const ruleSchema = z.object({
  name: z.string().trim().min(2, "Poné un nombre que te ayude a reconocerla."),
  trigger: z.enum(TRIGGERS),
  offsetMinutes: z.number().int(),
  channelOrder: z
    .array(z.enum(CHANNELS))
    .min(1, "Elegí al menos un canal por el que avisar."),
  serviceIds: z.array(z.string().uuid()),
  onlyIfMissed: z.boolean(),
  enabled: z.boolean(),
});

function read(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    trigger: String(formData.get("trigger") ?? "before_appointment"),
    offsetMinutes: Number(formData.get("offsetMinutes") ?? -1440),
    channelOrder: formData.getAll("channelOrder").map(String),
    serviceIds: formData.getAll("serviceIds").map(String).filter(Boolean),
    onlyIfMissed: formData.get("onlyIfMissed") === "on",
    enabled: formData.get("enabled") === "on",
  };
}

/**
 * El signo del desfase tiene que coincidir con el disparador, y la base lo
 * exige. Se corrige acá para que nadie tenga que pensarlo: "24 horas antes" se
 * escribe como un número positivo en el formulario y se guarda negativo.
 */
function normalizeOffset(trigger: Trigger, minutes: number): number {
  const abs = Math.abs(minutes);
  if (trigger === "before_appointment") return -abs;
  if (trigger === "after_appointment" || trigger === "no_activity") return abs;
  return 0;
}

function friendly(code: string | undefined): string {
  if (code === "42501") return "No tenés permiso para tocar las reglas.";
  if (code === "23505") return "Ya existe una regla con ese nombre.";
  if (code === "23514") {
    return "La configuración no cierra. Revisá el disparador y el momento del envío.";
  }
  return "No se pudo guardar. Probá de nuevo en unos segundos.";
}

/** Las plantillas van en campos con nombre `template_<canal>`. */
function readTemplates(formData: FormData): Array<[Channel, string]> {
  const out: Array<[Channel, string]> = [];
  for (const channel of CHANNELS) {
    const id = String(formData.get(`template_${channel}`) ?? "").trim();
    if (id) out.push([channel, id]);
  }
  return out;
}

export async function saveRule(
  ruleId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ruleSchema.safeParse(read(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const v = parsed.data;
  const templates = readTemplates(formData);

  // Una regla activa sin plantilla para el canal que va a usar no envía nada y
  // tampoco avisa. Mejor no dejar guardarla así.
  if (v.enabled) {
    const sinPlantilla = v.channelOrder.filter(
      (ch) => !templates.some(([canal]) => canal === ch),
    );
    if (sinPlantilla.length === v.channelOrder.length) {
      return {
        error:
          "Para activar la regla necesitás al menos una plantilla en alguno de los canales elegidos.",
        values: echo(formData),
      };
    }
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const row = {
    tenant_id: membership.tenantId,
    name: v.name,
    trigger: v.trigger,
    offset_minutes: normalizeOffset(v.trigger, v.offsetMinutes),
    channel_order: v.channelOrder,
    service_ids: v.serviceIds,
    only_if_missed: v.onlyIfMissed,
    enabled: v.enabled,
  };

  let id = ruleId;

  if (id) {
    const { error } = await supabase
      .from("reminder_rules")
      .update(row)
      .eq("id", id);
    if (error) return { error: friendly(error.code), values: echo(formData) };

    await supabase.from("rule_templates").delete().eq("rule_id", id);
  } else {
    const { data, error } = await supabase
      .from("reminder_rules")
      .insert(row)
      .select("id")
      .single();
    if (error) return { error: friendly(error.code), values: echo(formData) };
    id = data.id;
  }

  if (templates.length > 0) {
    const { error } = await supabase.from("rule_templates").insert(
      templates.map(([channel, template_id]) => ({
        rule_id: id!,
        channel,
        template_id,
        tenant_id: membership.tenantId,
      })),
    );
    if (error) return { error: friendly(error.code), values: echo(formData) };
  }

  revalidatePath("/recordatorios");
  redirect("/recordatorios");
}

/** Prender o apagar una regla desde el listado, sin abrirla. */
export async function toggleRule(id: string, enabled: boolean) {
  const supabase = await createClient();
  await supabase.from("reminder_rules").update({ enabled }).eq("id", id);

  // Apagar una regla cancela lo que todavía no salió. Si quedaran en la cola,
  // al apagarla igual seguirían enviándose y nadie entendería por qué.
  if (!enabled) {
    await supabase
      .from("message_jobs")
      .update({
        status: "cancelled",
        skip_reason: "Se apagó la regla.",
      })
      .eq("rule_id", id)
      .eq("status", "pending");
  }

  revalidatePath("/recordatorios");
}

export async function deleteRule(id: string) {
  const supabase = await createClient();
  await supabase.from("reminder_rules").delete().eq("id", id);
  revalidatePath("/recordatorios");
}

/** Freno general: para todo sin tocar ninguna regla. */
export async function setSendingEnabled(enabled: boolean, reason?: string) {
  const membership = await getCurrentTenant();
  if (!membership) return;

  const supabase = await createClient();
  await supabase
    .from("messaging_settings")
    .update({
      sending_enabled: enabled,
      paused_reason: enabled ? null : (reason ?? "Frenado a mano."),
    })
    .eq("tenant_id", membership.tenantId);

  revalidatePath("/recordatorios");
}

/**
 * Salir del modo de prueba es el acto más delicado del sistema: a partir de
 * ahí los mensajes llegan a personas reales. Por eso es explícito y se
 * registra quién lo hizo.
 */
export async function setTestMode(testMode: boolean) {
  const membership = await getCurrentTenant();
  if (!membership) return;

  const supabase = await createClient();
  await supabase
    .from("messaging_settings")
    .update({ test_mode: testMode })
    .eq("tenant_id", membership.tenantId);

  revalidatePath("/recordatorios");
}

/** Cancela un envío puntual que todavía no salió. */
export async function cancelJob(id: string) {
  const supabase = await createClient();
  await supabase
    .from("message_jobs")
    .update({ status: "cancelled", skip_reason: "Cancelado a mano." })
    .eq("id", id)
    .eq("status", "pending");

  revalidatePath("/recordatorios");
}

/** Lo llama el constructor para mostrar el costo mientras se arma la regla. */
export async function simulateRule(params: {
  trigger: Trigger;
  offsetMinutes: number;
  channelOrder: Channel[];
  serviceIds: string[];
  onlyIfMissed: boolean;
}): Promise<Simulation> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("simulate_rule", {
    p_trigger: params.trigger,
    p_offset_minutes: normalizeOffset(params.trigger, params.offsetMinutes),
    p_channel_order: params.channelOrder,
    p_service_ids: params.serviceIds,
    p_only_if_missed: params.onlyIfMissed,
  });

  if (error) return [];
  return (data ?? []).map((r) => ({
    channel: r.channel,
    recipients: Number(r.recipients),
    cost_cents: Number(r.cost_cents),
  }));
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  name: z.string().trim().min(2, "Poné un nombre para la plantilla."),
  channel: z.enum(CHANNELS),
  category: z.enum(["utility", "marketing"]),
  subject: z.string().trim().max(200).optional(),
  body: z
    .string()
    .trim()
    .min(5, "El mensaje es demasiado corto.")
    .max(1024, "El mensaje es demasiado largo."),
  providerName: z.string().trim().max(80).optional(),
  quickReplies: z.array(z.enum(["confirmar", "reprogramar", "baja"])),
});

export async function saveTemplate(
  templateId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = templateSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    channel: String(formData.get("channel") ?? "email"),
    category: String(formData.get("category") ?? "utility"),
    subject: String(formData.get("subject") ?? "").trim() || undefined,
    body: String(formData.get("body") ?? ""),
    providerName: String(formData.get("providerName") ?? "").trim() || undefined,
    quickReplies: formData.getAll("quickReplies").map(String),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const v = parsed.data;

  if (v.channel === "whatsapp" && !v.providerName) {
    return {
      error:
        "Una plantilla de WhatsApp necesita el nombre exacto con el que la aprobó Meta.",
      values: echo(formData),
    };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();
  const row = {
    tenant_id: membership.tenantId,
    name: v.name,
    channel: v.channel,
    category: v.category,
    subject: v.subject ?? null,
    body: v.body,
    provider_name: v.providerName ?? null,
    // Los botones sólo existen en WhatsApp: el correo no los tiene.
    quick_replies: v.channel === "whatsapp" ? v.quickReplies : [],
  };

  const { error } = templateId
    ? await supabase.from("message_templates").update(row).eq("id", templateId)
    : await supabase.from("message_templates").insert(row);

  if (error) return { error: friendly(error.code), values: echo(formData) };

  revalidatePath("/recordatorios/plantillas");
  redirect("/recordatorios/plantillas");
}
