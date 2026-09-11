/**
 * La plata se guarda en centavos y como entero. Con decimales de punto
 * flotante, sumar mil turnos termina dando un total que no cierra con la caja.
 */

const AR = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 1000000 → "$ 10.000" */
export function formatPrice(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "A convenir";
  return AR.format(cents / 100);
}

/** 1000000 → "10000", para precargar un input. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return String(Math.round(cents / 100));
}

/**
 * Acepta lo que una persona realmente escribe: "10.000", "10000", "$ 10.000",
 * "10000,50". Devuelve null si no hay un número usable.
 */
export function parsePriceToCents(raw: string): number | null {
  const cleaned = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  if (cleaned === "" || cleaned === "-") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100);
}

/** 40 → "40 min"; 90 → "1 h 30 min"; 60 → "1 h" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
