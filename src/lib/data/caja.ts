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

/**
 * Los cobros del día que no cayeron en ninguna caja.
 *
 * Pasa cuando se registra una transferencia o un Mercado Pago con la caja
 * cerrada: no hay cajón donde ponerlos, pero la plata entró igual. Sin esta
 * lista quedarían guardados y en ninguna pantalla, que es la peor forma de
 * perder un cobro.
 */
export async function listLooseMovements(
  from: Date,
  to: Date,
): Promise<MovementWithDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_movements")
    .select(
      "*, client:clients ( id, first_name, last_name ), author:profiles ( full_name )",
    )
    .is("session_id", null)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
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

export type AppointmentCharge = Pick<
  CashMovement,
  | "id"
  | "kind"
  | "method"
  | "amount_cents"
  | "concept"
  | "created_at"
  | "reverses_id"
>;

export type AppointmentCharges = {
  /** Cobrado menos devuelto. Es el mismo número que `appointment_paid_cents()`. */
  paidCents: number;
  movements: AppointmentCharge[];
};

/**
 * Lo que se cobró de un turno, con el detalle.
 *
 * El total se suma acá en lugar de pedirlo a `appointment_paid_cents()`: los
 * movimientos hacen falta igual para mostrarlos, y sumar seis filas en memoria
 * es más barato que un segundo viaje a la base para obtener el mismo número.
 */
export async function getAppointmentCharges(
  appointmentId: string,
): Promise<AppointmentCharges> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_movements")
    .select("id, kind, method, amount_cents, concept, created_at, reverses_id")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true });

  const movements = (data ?? []) as AppointmentCharge[];
  const paidCents = movements.reduce(
    (total, m) =>
      total + (m.kind === "income" ? 1 : -1) * Number(m.amount_cents),
    0,
  );

  return { paidCents, movements };
}
