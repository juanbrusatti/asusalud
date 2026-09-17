"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Bajar el cartel de «pagá la cuenta».
 *
 * Baja el cartel y nada más: la deuda sigue estando en «Tu cuenta», que es
 * donde corresponde. Esto no es «ya lo pagué», es «ya lo vi».
 *
 * La tabla tiene política de UPDATE para quien dirige el negocio, así que no
 * hace falta ninguna función con permisos especiales.
 */
export async function bajarCartel(periodo: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("billing_nudges")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("period", periodo)
    .is("dismissed_at", null);

  revalidatePath("/");
  revalidatePath("/configuracion/cuenta");
}
