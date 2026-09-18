import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Invitacion, Miembro } from "@/lib/equipo";

/** Quiénes están en el equipo. Vacío si quien pregunta no lo dirige. */
export async function getEquipo(): Promise<Miembro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_members");
  if (error) return [];
  return (data as unknown as Miembro[]) ?? [];
}

/** Las invitaciones que todavía no se usaron ni vencieron. */
export async function getInvitaciones(): Promise<Invitacion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, role, label, token, expires_at, used_at, created_at")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data as unknown as Invitacion[]) ?? [];
}
