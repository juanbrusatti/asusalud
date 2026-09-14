"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { parsePriceToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export type FormState = {
  error: string | null;
  notice?: string | null;
  values?: Record<string, string>;
};

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

const SIN_CAJA = "Abrí la caja antes de registrar movimientos en efectivo.";

function friendly(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "Ya hay una caja abierta.";
  // La base también lo impide, no sólo la comprobación de más arriba: si algún
  // día se cobra desde otra pantalla, el mensaje sigue siendo el mismo.
  if (error.message?.includes("cash_movements_cash_needs_session")) {
    return SIN_CAJA;
  }
  if (error.code === "42501") {
    return error.message ?? "No tenés permiso para hacer eso.";
  }
  if (error.code === "23514") return error.message ?? "Revisá los importes.";
  return "No se pudo guardar. Probá de nuevo en unos segundos.";
}

const METHODS = [
  "cash",
  "transfer",
  "debit",
  "credit",
  "mercadopago",
  "other",
] as const;

/** Abre la caja del día con lo que haya en el cajón. */
export async function abrirCaja(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const cents = parsePriceToCents(String(formData.get("opening") ?? "0")) ?? 0;

  const supabase = await createClient();
  const { error } = await supabase.rpc("cash_open_session", {
    p_opening_cents: cents,
  });

  if (error) return { error: friendly(error), values: echo(formData) };

  revalidatePath("/caja");
  return { error: null };
}

const movimientoSchema = z.object({
  kind: z.enum(["income", "expense"]),
  method: z.enum(METHODS),
  amountCents: z
    .number()
    .int()
    .positive("Poné un importe mayor a cero."),
  concept: z.string().trim().min(2, "Escribí de qué se trata."),
  appointmentId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
});

export async function registrarMovimiento(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = movimientoSchema.safeParse({
    kind: String(formData.get("kind") ?? "income"),
    method: String(formData.get("method") ?? "cash"),
    amountCents: parsePriceToCents(String(formData.get("amount") ?? "")) ?? 0,
    concept: String(formData.get("concept") ?? ""),
    appointmentId: String(formData.get("appointmentId") ?? "") || null,
    clientId: String(formData.get("clientId") ?? "") || null,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos.",
      values: echo(formData),
    };
  }

  const membership = await getCurrentTenant();
  if (!membership) return { error: "No encontramos tu negocio." };

  const supabase = await createClient();

  const [{ data: branch }, { data: session }] = await Promise.all([
    supabase.from("branches").select("id").eq("is_default", true).maybeSingle(),
    supabase.from("cash_sessions").select("id").is("closed_at", null).maybeSingle(),
  ]);

  if (!branch) return { error: "No encontramos tu sucursal." };

  // El efectivo necesita una caja abierta: si no, no hay dónde contarlo al
  // cerrar el día. Lo demás se puede registrar igual.
  if (!session && parsed.data.method === "cash") {
    return { error: SIN_CAJA, values: echo(formData) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("cash_movements").insert({
    tenant_id: membership.tenantId,
    branch_id: branch.id,
    session_id: session?.id ?? null,
    kind: parsed.data.kind,
    method: parsed.data.method,
    amount_cents: parsed.data.amountCents,
    concept: parsed.data.concept,
    appointment_id: parsed.data.appointmentId,
    client_id: parsed.data.clientId,
    created_by: user?.id ?? null,
  });

  if (error) return { error: friendly(error), values: echo(formData) };

  revalidatePath("/caja");
  if (parsed.data.appointmentId) {
    revalidatePath(`/agenda/${parsed.data.appointmentId}`);
  }
  return { error: null, notice: "Registrado." };
}

/** Anula un movimiento con su contrario. El original queda. */
export async function anularMovimiento(id: string, motivo?: string) {
  const supabase = await createClient();
  await supabase.rpc("cash_reverse_movement", {
    p_movement: id,
    p_reason: motivo ?? "",
  });
  revalidatePath("/caja");
}

export type CierreResult = {
  error: string | null;
  arqueo?: {
    expectedCents: number;
    countedCents: number;
    differenceCents: number;
  };
};

export async function cerrarCaja(
  sessionId: string,
  _prev: CierreResult,
  formData: FormData,
): Promise<CierreResult> {
  const contado = parsePriceToCents(String(formData.get("counted") ?? ""));

  if (contado === null) {
    return { error: "Poné cuánto efectivo contaste." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_close_session", {
    p_session: sessionId,
    p_counted_cents: contado,
    p_notes: String(formData.get("notes") ?? ""),
  });

  if (error) return { error: friendly(error) };

  // A propósito NO se revalida acá: si la página se vuelve a renderizar, la
  // tarjeta con el arqueo desaparece en el mismo instante en que aparece, y es
  // justamente el dato por el que se cierra la caja. Se refresca sola en la
  // próxima navegación.

  const arqueo = data as unknown as {
    expectedCents: number;
    countedCents: number;
    differenceCents: number;
  };

  return {
    error: null,
    arqueo: {
      expectedCents: Number(arqueo.expectedCents),
      countedCents: Number(arqueo.countedCents),
      differenceCents: Number(arqueo.differenceCents),
    },
  };
}
