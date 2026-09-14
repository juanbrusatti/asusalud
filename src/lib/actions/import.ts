"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];

/** Una fila ya mapeada por el navegador, todavía sin validar. */
const rowSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  documentId: z.string().optional(),
  birthdate: z.string().optional(),
  legacyVisits: z.string().optional(),
  legacyTotal: z.string().optional(),
  legacyLastVisit: z.string().optional(),
  notes: z.string().optional(),
});

export type ImportRow = z.infer<typeof rowSchema>;

export type ImportBatchResult = {
  created: number;
  updated: number;
  skipped: number;
  /** Filas que no se pudieron cargar, con el motivo en castellano. */
  problems: Array<{ line: number; name: string; reason: string }>;
};

/** "$ 1.023.500" → 102350000 centavos. */
function moneyToCents(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function toInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/[^\d-]/g, ""));
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** Acepta 2024-03-15, 15/03/2024 y 15-03-2024. */
function toDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(text);
  if (local) {
    const [, d, m, y] = local;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/**
 * Carga un lote de filas.
 *
 * El navegador manda de a quinientas para no pasarse del tamaño máximo de una
 * Server Action y para poder mostrar el avance. Cada lote es independiente: si
 * uno falla, los anteriores ya quedaron guardados.
 */
export async function importClientsBatch(
  rows: ImportRow[],
  options: { updateExisting: boolean; startLine: number },
): Promise<ImportBatchResult> {
  const membership = await getCurrentTenant();
  if (!membership) {
    return {
      created: 0,
      updated: 0,
      skipped: rows.length,
      problems: [
        { line: options.startLine, name: "", reason: "No encontramos tu negocio." },
      ],
    };
  }

  const supabase = await createClient();
  const result: ImportBatchResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    problems: [],
  };

  type Prepared = {
    line: number;
    name: string;
    row: ClientInsert;
    phone: string | null;
    email: string | null;
  };

  const prepared: Prepared[] = [];

  rows.forEach((raw, index) => {
    const line = options.startLine + index;
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      result.problems.push({ line, name: "", reason: "Fila ilegible." });
      return;
    }

    const v = parsed.data;
    const firstName = (v.firstName ?? "").trim();
    const lastName = (v.lastName ?? "").trim();
    const name = [firstName, lastName].filter(Boolean).join(" ");

    if (!firstName) {
      result.problems.push({ line, name, reason: "Sin nombre." });
      return;
    }

    const phone = v.phone ? normalizePhone(v.phone) : null;
    if (phone?.error) {
      // El teléfono malo no descarta la ficha: se guarda el crudo y queda
      // visible para corregir. Perder a la persona sería peor.
      result.problems.push({
        line,
        name,
        reason: `Teléfono sin interpretar, se guardó tal cual: ${phone.error}`,
      });
    }

    const email = (v.email ?? "").trim().toLowerCase() || null;
    const emailValido = email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (email && !emailValido) {
      result.problems.push({ line, name, reason: `Correo descartado: ${email}` });
    }

    prepared.push({
      line,
      name,
      phone: phone?.e164 ?? null,
      email: emailValido ? email : null,
      row: {
        tenant_id: membership.tenantId,
        first_name: firstName.slice(0, 80),
        last_name: lastName.slice(0, 80) || null,
        phone_raw: v.phone?.trim() || null,
        phone_e164: phone?.e164 ?? null,
        email: emailValido ? email : null,
        document_id: v.documentId?.trim().slice(0, 30) || null,
        birthdate: toDate(v.birthdate),
        legacy_source: "importación",
        legacy_visits_count: toInt(v.legacyVisits),
        legacy_total_cents: moneyToCents(v.legacyTotal),
        legacy_last_visit_on: toDate(v.legacyLastVisit),
      },
    });
  });

  if (prepared.length === 0) return result;

  // Se busca qué fichas ya existen, por teléfono y por correo. Una sola
  // consulta para todo el lote en lugar de una por fila.
  const phones = [...new Set(prepared.map((p) => p.phone).filter(Boolean))] as string[];
  const emails = [...new Set(prepared.map((p) => p.email).filter(Boolean))] as string[];

  const existing = new Map<string, string>();

  if (phones.length > 0) {
    const { data } = await supabase
      .from("clients")
      .select("id, phone_e164")
      .in("phone_e164", phones);
    for (const r of data ?? []) {
      if (r.phone_e164) existing.set(`p:${r.phone_e164}`, r.id);
    }
  }

  if (emails.length > 0) {
    const { data } = await supabase
      .from("clients")
      .select("id, email")
      .in("email", emails);
    for (const r of data ?? []) {
      if (r.email) existing.set(`e:${r.email.toLowerCase()}`, r.id);
    }
  }

  const nuevos: ClientInsert[] = [];

  for (const p of prepared) {
    const match =
      (p.phone && existing.get(`p:${p.phone}`)) ||
      (p.email && existing.get(`e:${p.email}`)) ||
      null;

    if (match) {
      if (options.updateExisting) {
        // El tenant no se toca al actualizar: la ficha ya vive donde debe.
        const { tenant_id, ...fields } = p.row;
        void tenant_id;
        const { error } = await supabase
          .from("clients")
          .update(fields)
          .eq("id", match);
        if (error) {
          result.problems.push({
            line: p.line,
            name: p.name,
            reason: "No se pudo actualizar la ficha existente.",
          });
        } else {
          result.updated += 1;
        }
      } else {
        result.skipped += 1;
      }
      continue;
    }

    nuevos.push(p.row);
    // Se registra para que dos filas iguales dentro del mismo archivo no
    // generen dos fichas.
    if (p.phone) existing.set(`p:${p.phone}`, "pendiente");
    if (p.email) existing.set(`e:${p.email}`, "pendiente");
  }

  if (nuevos.length > 0) {
    const { error, count } = await supabase
      .from("clients")
      .insert(nuevos, { count: "exact" });

    if (error) {
      result.problems.push({
        line: options.startLine,
        name: "",
        reason: `No se pudo guardar el lote: ${error.message}`,
      });
    } else {
      result.created += count ?? nuevos.length;
    }
  }

  revalidatePath("/clientes");
  return result;
}
