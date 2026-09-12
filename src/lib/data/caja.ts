import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CashMovement,
  CashSession,
  PaymentMethod,
} from "@/lib/caja";

export type {
  CashMovement,
  CashSession,
  MovementKind,
  PaymentMethod,
} from "@/lib/caja";
export { EXPENSE_PRESETS, METHODS, METHOD_LABELS } from "@/lib/caja";

export type MovementWithDetail = CashMovement & {
  client: { id: string; first_name: string; last_name: string | null } | null;
  author: { full_name: string | null } | null;
};

/** La caja que está abierta ahora, si hay alguna. */
export async function getOpenSession(): Promise<CashSession | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_sessions")
    .select("*")
    .is("closed_at", null)
    .maybeSingle();
  return data;
}

export async function getSession(id: string): Promise<CashSession | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function listSessions(limit = 30): Promise<CashSession[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_sessions")
    .select("*")
    .not("closed_at", "is", null)
    .order("opened_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listMovements(
  sessionId: string,
): Promise<MovementWithDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_movements")
    .select(
      "*, client:clients ( id, first_name, last_name ), author:profiles ( full_name )",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as MovementWithDetail[];
}

export type SessionTotals = {
  /** Lo que debería haber en el cajón, según los movimientos en efectivo. */
  expectedCents: number;
  /** Lo cobrado, por medio de pago. El efectivo es sólo una parte. */
  byMethod: Array<{ method: PaymentMethod; cents: number }>;
  incomeCents: number;
  expenseCents: number;
};

export async function getTotals(sessionId: string): Promise<SessionTotals> {
  const supabase = await createClient();

  const [{ data: expected }, { data: movs }] = await Promise.all([
    supabase.rpc("session_expected_cents_public", { p_session: sessionId }),
    supabase
      .from("cash_movements")
      .select("kind, method, amount_cents")
      .eq("session_id", sessionId),
  ]);

  const rows = movs ?? [];
  const porMedio = new Map<PaymentMethod, number>();

  let income = 0;
  let expense = 0;

  for (const m of rows) {
    const signo = m.kind === "income" ? 1 : -1;
    const cents = Number(m.amount_cents);

    if (m.kind === "income") income += cents;
    else expense += cents;

    porMedio.set(
      m.method,
      (porMedio.get(m.method) ?? 0) + signo * cents,
    );
  }

  return {
    expectedCents: Number(expected ?? 0),
    byMethod: [...porMedio.entries()]
      .filter(([, cents]) => cents !== 0)
      .map(([method, cents]) => ({ method, cents })),
    incomeCents: income,
    expenseCents: expense,
  };
}

/** Cuánto se cobró de un turno. Sirve para mostrar el saldo al cobrar. */
export async function getPaidForAppointment(id: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("appointment_paid_cents", {
    p_appointment: id,
  });
  return Number(data ?? 0);
}
