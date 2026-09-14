"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string | null };

const schema = z.object({
  name: z.string().min(2, "Poné el nombre del negocio."),
});

/** Convierte "Estética Asusalud" en "estetica-asusalud". */
function toSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createTenant(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const base = toSlug(parsed.data.name);
  if (base.length < 3) {
    return { error: "El nombre necesita al menos tres letras o números." };
  }

  const supabase = await createClient();

  // El alta pasa sí o sí por la función de la base, que crea negocio,
  // membresía de titular y sucursal principal en una sola transacción.
  let { error } = await supabase.rpc("create_tenant", {
    p_name: parsed.data.name.trim(),
    p_slug: base,
  });

  // 23505 = el slug ya existe. Se reintenta una vez con un sufijo corto.
  if (error?.code === "23505") {
    const suffix = Math.random().toString(36).slice(2, 6);
    ({ error } = await supabase.rpc("create_tenant", {
      p_name: parsed.data.name.trim(),
      p_slug: `${base.slice(0, 35)}-${suffix}`,
    }));
  }

  if (error) {
    return {
      error: "No se pudo crear el negocio. Probá de nuevo en unos segundos.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
