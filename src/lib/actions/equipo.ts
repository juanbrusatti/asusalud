"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RolEquipo } from "@/lib/equipo";

/**
 * Sumar y sacar gente del equipo.
 *
 * Ninguna de estas acciones comprueba permisos acá: las cuatro llaman a
 * funciones de la base que lo hacen por su cuenta. Comprobarlo en dos lugares
 * es garantizar que algún día digan cosas distintas.
 */

export type EquipoState = { error: string | null; notice?: string | null };

type Respuesta = { ok: boolean; error?: string };

/** Crea una invitación y devuelve el enlace listo para mandar. */
export async function invitar(
  rol: RolEquipo,
  nombre: string,
): Promise<EquipoState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_invite", {
    p_role: rol,
    p_label: nombre.trim() || undefined,
  });

  if (error) return { error: "No se pudo crear la invitación." };

  const r = data as unknown as Respuesta;
  if (!r?.ok) return { error: r?.error ?? "No se pudo crear la invitación." };

  revalidatePath("/configuracion/equipo");
  return { error: null, notice: "Invitación lista." };
}

export async function cancelarInvitacion(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id);
  revalidatePath("/configuracion/equipo");
}

export async function sacarDelEquipo(userId: string): Promise<EquipoState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_remove", {
    p_user: userId,
  });

  if (error) return { error: "No se pudo sacar a esa persona." };

  const r = data as unknown as Respuesta;
  if (!r?.ok) return { error: r?.error ?? "No se pudo." };

  revalidatePath("/configuracion/equipo");
  return { error: null, notice: "Listo, ya no tiene acceso." };
}

/** Aceptar una invitación. La llama quien ya entró con su cuenta. */
export async function unirse(token: string): Promise<EquipoState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_join", { p_token: token });

  if (error) return { error: "No se pudo usar ese enlace." };

  const r = data as unknown as Respuesta & { ya_estaba?: boolean };
  if (!r?.ok) return { error: r?.error ?? "Ese enlace no sirve." };

  revalidatePath("/", "layout");
  return {
    error: null,
    notice: r.ya_estaba ? "Ya estabas en este equipo." : "Listo, ya estás adentro.",
  };
}
