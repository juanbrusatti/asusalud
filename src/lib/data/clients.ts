import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type ClientTag = Database["public"]["Tables"]["client_tags"]["Row"];
export type ClientNote = Database["public"]["Tables"]["client_notes"]["Row"] & {
  author: { full_name: string | null } | null;
};

export const PAGE_SIZE = 50;

/**
 * Lo mismo que hace `unaccent` en la base, pero en JavaScript, para que lo que
 * se escribe en el buscador se compare contra la columna `search_text`.
 */
export function normalizeSearch(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export type ClientListResult = {
  clients: Client[];
  total: number;
  page: number;
  pageCount: number;
};

export async function searchClients({
  query = "",
  page = 1,
}: {
  query?: string;
  page?: number;
}): Promise<ClientListResult> {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;

  let request = supabase
    .from("clients")
    .select("*", { count: "exact" })
    .order("last_name", { ascending: true, nullsFirst: false })
    .order("first_name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const needle = normalizeSearch(query);
  if (needle) {
    // El índice GIN de trigramas hace que este LIKE con comodín a ambos lados
    // siga siendo rápido con miles de fichas.
    request = request.like("search_text", `%${needle}%`);
  }

  const { data, error, count } = await request;
  if (error) throw error;

  const total = count ?? 0;
  return {
    clients: data ?? [],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function countPhoneDuplicates(id: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_phone_duplicates", {
    p_client: id,
  });
  if (error) return 0;
  return data ?? 0;
}

export async function listNotes(clientId: string): Promise<ClientNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_notes")
    .select("*, author:profiles ( full_name )")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ClientNote[];
}

export async function listTags(): Promise<ClientTag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_tags")
    .select("*")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function listTagIdsFor(clientId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_tag_assignments")
    .select("tag_id")
    .eq("client_id", clientId);

  if (error) throw error;
  return (data ?? []).map((r) => r.tag_id);
}

/** Nombre completo listo para mostrar. */
export function fullName(c: Pick<Client, "first_name" | "last_name">): string {
  return [c.last_name, c.first_name].filter(Boolean).join(", ") || c.first_name;
}
