"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Conectar y desconectar WhatsApp.
 *
 * Nada de esto escribe en la tabla directamente: pasa por funciones de la base
 * que comprueban el rol por su cuenta, porque `whatsapp_accounts` no tiene
 * ningún permiso para quien navega. El token viaja hacia adentro y no vuelve
 * nunca.
 */

export type ConexionState = {
  error: string | null;
  notice?: string | null;
  values?: Record<string, string>;
};

const schema = z.object({
  phoneNumberId: z
    .string()
    .trim()
    .min(5, "Copiá el identificador del número, tal como aparece en Meta."),
  accessToken: z
    .string()
    .trim()
    .min(20, "El token es más largo que eso. Copialo entero."),
  wabaId: z.string().trim().optional(),
  displayPhone: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
  verifyToken: z.string().trim().optional(),
});

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [clave, valor] of formData.entries()) {
    // El token y el secreto no se devuelven a la pantalla: si el formulario
    // falla por otro campo, se vuelven a pegar.
    if (clave === "accessToken" || clave === "appSecret") continue;
    if (typeof valor === "string") out[clave] = valor;
  }
  return out;
}

export async function conectarWhatsapp(
  _prev: ConexionState,
  formData: FormData,
): Promise<ConexionState> {
  const parsed = schema.safeParse({
    phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
    accessToken: String(formData.get("accessToken") ?? ""),
    wabaId: String(formData.get("wabaId") ?? ""),
    displayPhone: String(formData.get("displayPhone") ?? ""),
    appSecret: String(formData.get("appSecret") ?? ""),
    verifyToken: String(formData.get("verifyToken") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("whatsapp_connect", {
    p_phone_number_id: parsed.data.phoneNumberId,
    p_access_token: parsed.data.accessToken,
    p_waba_id: parsed.data.wabaId || undefined,
    p_display_phone: parsed.data.displayPhone || undefined,
    p_app_secret: parsed.data.appSecret || undefined,
    p_verify_token: parsed.data.verifyToken || undefined,
    p_onboarding: "manual",
  });

  if (error) {
    return { error: "No se pudo guardar la conexión.", values: echo(formData) };
  }

  const r = data as unknown as { ok: boolean; error?: string };
  if (!r?.ok) {
    return { error: r?.error ?? "No se pudo guardar.", values: echo(formData) };
  }

  revalidatePath("/configuracion/whatsapp");
  return { error: null, notice: "Guardado." };
}

export async function desconectarWhatsapp(): Promise<ConexionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("whatsapp_disconnect");

  if (error) return { error: "No se pudo desconectar." };

  const r = data as unknown as { ok: boolean; error?: string };
  if (!r?.ok) return { error: r?.error ?? "No se pudo desconectar." };

  revalidatePath("/configuracion/whatsapp");
  return { error: null };
}
