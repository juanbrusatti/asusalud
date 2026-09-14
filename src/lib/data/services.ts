import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Service = Database["public"]["Tables"]["services"]["Row"];
export type ServiceCategory =
  Database["public"]["Tables"]["service_categories"]["Row"];

export type ServiceWithCategory = Service & {
  category: Pick<ServiceCategory, "id" | "name"> | null;
};

/**
 * Catálogo completo del negocio, activos e inactivos.
 *
 * No hace falta filtrar por tenant: la RLS ya devuelve sólo lo que esta
 * persona puede ver. Filtrar acá además sería engañoso, porque haría parecer
 * que la seguridad vive en esta consulta.
 */
export async function listServices(): Promise<ServiceWithCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select("*, category:service_categories ( id, name )")
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ServiceWithCategory[];
}

export async function getService(id: string): Promise<Service | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listCategories(): Promise<ServiceCategory[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
