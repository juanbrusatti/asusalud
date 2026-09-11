import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  Channel,
  MessagingSettings,
  RuleWithTemplates,
  Simulation,
  Template,
  Trigger,
} from "@/lib/recordatorios";

// Se reexportan para que las pantallas puedan pedir tipos y consultas del
// mismo lugar sin tener que saber cuál vive dónde.
export type {
  Channel,
  MessagingSettings,
  Rule,
  RuleWithTemplates,
  Simulation,
  Template,
  Trigger,
} from "@/lib/recordatorios";
export {
  CHANNEL_LABELS,
  OFFSET_PRESETS,
  TRIGGER_LABELS,
  describeOffset,
  normalizeOffset,
} from "@/lib/recordatorios";

export async function listRules(): Promise<RuleWithTemplates[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_rules")
    .select("*, rule_templates ( channel, template_id )")
    .order("enabled", { ascending: false })
    .order("offset_minutes", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as RuleWithTemplates[];
}

export async function getRule(id: string): Promise<RuleWithTemplates | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_rules")
    .select("*, rule_templates ( channel, template_id )")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as RuleWithTemplates) ?? null;
}

export async function listTemplates(): Promise<Template[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .order("channel")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getSettings(): Promise<MessagingSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messaging_settings")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export type QueueSummary = {
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Lo que se gastó en lo que va del mes, en centavos. */
  spentCents: number;
  /** Lo que va a costar lo que todavía está en la cola. */
  plannedCents: number;
};

export async function getQueueSummary(): Promise<QueueSummary> {
  const supabase = await createClient();

  const inicioDeMes = new Date();
  inicioDeMes.setDate(1);
  inicioDeMes.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("message_jobs")
    .select("status, cost_cents, sent_at")
    .gte("scheduled_for", inicioDeMes.toISOString());

  if (error) throw error;

  const rows = data ?? [];
  const cuenta = (estado: string) =>
    rows.filter((r) => r.status === estado).length;

  return {
    pending: cuenta("pending"),
    sent: cuenta("sent"),
    skipped: cuenta("skipped"),
    failed: cuenta("failed"),
    spentCents: rows
      .filter((r) => r.status === "sent")
      .reduce((sum, r) => sum + Number(r.cost_cents), 0),
    plannedCents: rows
      .filter((r) => r.status === "pending")
      .reduce((sum, r) => sum + Number(r.cost_cents), 0),
  };
}

export type UpcomingJob = {
  id: string;
  channel: Channel | null;
  scheduled_for: string;
  status: string;
  cost_cents: number;
  skip_reason: string | null;
  client: { id: string; first_name: string; last_name: string | null } | null;
  rule: { name: string } | null;
};

export async function listUpcoming(limit = 20): Promise<UpcomingJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_jobs")
    .select(
      "id, channel, scheduled_for, status, cost_cents, skip_reason, client:clients ( id, first_name, last_name ), rule:reminder_rules ( name )",
    )
    .in("status", ["pending", "skipped"])
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as UpcomingJob[];
}

/** Cuánta gente alcanza una configuración de regla y cuánto sale. */
export async function simulate(params: {
  trigger: Trigger;
  offsetMinutes: number;
  channelOrder: Channel[];
  serviceIds?: string[];
  onlyIfMissed?: boolean;
}): Promise<Simulation> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("simulate_rule", {
    p_trigger: params.trigger,
    p_offset_minutes: params.offsetMinutes,
    p_channel_order: params.channelOrder,
    p_service_ids: params.serviceIds ?? [],
    p_only_if_missed: params.onlyIfMissed ?? false,
  });

  if (error) throw error;
  return (data ?? []).map((r) => ({
    channel: r.channel,
    recipients: Number(r.recipients),
    cost_cents: Number(r.cost_cents),
  }));
}
