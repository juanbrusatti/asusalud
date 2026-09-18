import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type Membership = {
  tenantId: string;
  role: AppRole;
  tenant: { id: string; name: string; slug: string; timezone: string };
};

/**
 * Negocios de la persona que está navegando.
 *
 * Va envuelto en `cache` para que varios componentes del mismo render compartan
 * una sola consulta. No hace falta filtrar por usuario: la RLS ya devuelve
 * únicamente sus membresías.
 */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  // Sin sesión no hay nada que preguntar, y preguntar igual rompe: la tabla no
  // tiene ningún permiso para `anon` —bien que no lo tenga— así que la
  // consulta vuelve con un error en vez de con una lista vacía. Desde que la
  // portada vive en la misma dirección que el inicio, por acá pasa también
  // gente sin cuenta.
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("tenant_id, role, tenants ( id, name, slug, timezone )")
    .eq("status", "active");

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.tenants !== null)
    .map((row) => ({
      tenantId: row.tenant_id,
      role: row.role,
      tenant: row.tenants as Membership["tenant"],
    }));
});

/** El negocio activo. Hoy es la primera; cuando haya varias, un selector. */
export const getCurrentTenant = cache(async (): Promise<Membership | null> => {
  const memberships = await getMemberships();
  return memberships[0] ?? null;
});

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

const RANK: Record<AppRole, number> = {
  owner: 4,
  admin: 3,
  reception: 2,
  staff: 1,
};

/**
 * Chequeo de rol para decidir qué mostrar en pantalla. No es una barrera de
 * seguridad: esconder un botón no impide el pedido. Quien decide es la RLS.
 */
export function atLeast(role: AppRole, minimum: AppRole): boolean {
  return RANK[role] >= RANK[minimum];
}
