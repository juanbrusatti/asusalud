import type { Database } from "@/lib/supabase/types";

/**
 * Tipos y etiquetas de la caja.
 *
 * Separado del módulo de consultas porque los formularios son componentes de
 * cliente: importar las etiquetas desde `lib/data` arrastraría `next/headers`
 * al navegador.
 */

export type CashSession = Database["public"]["Tables"]["cash_sessions"]["Row"];
export type CashMovement = Database["public"]["Tables"]["cash_movements"]["Row"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type MovementKind = Database["public"]["Enums"]["movement_kind"];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  debit: "Débito",
  credit: "Crédito",
  mercadopago: "Mercado Pago",
  other: "Otro",
};

/** El orden en que aparecen al cobrar: el efectivo primero porque es el común. */
export const METHODS: PaymentMethod[] = [
  "cash",
  "transfer",
  "debit",
  "credit",
  "mercadopago",
  "other",
];

/** Conceptos de egreso que se repiten todos los meses. */
export const EXPENSE_PRESETS = [
  "Compra de insumos",
  "Retiro de caja",
  "Pago a proveedor",
  "Limpieza",
  "Servicios",
] as const;
