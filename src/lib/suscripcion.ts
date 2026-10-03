/**
 * La suscripción: dónde está parada una cuenta y cómo decirlo.
 *
 * El estado lo calcula la base (`app.estado_suscripcion`); acá sólo se le da
 * forma. Calcularlo de nuevo en el navegador sería tener dos relojes que
 * tarde o temprano no coinciden.
 */

export type EstadoSuscripcion =
  | "acuerdo"
  | "prueba"
  | "activa"
  | "a_pagar"
  | "suspendida";

export type PagoSuscripcion = {
  fecha: string;
  pagado_cents: number;
  cubre_hasta: string;
  origen: "manual" | "mercadopago";
};

export type Suscripcion = {
  plan: "suscripcion" | "acuerdo";
  estado: EstadoSuscripcion;
  prueba_hasta?: string;
  pagado_hasta?: string;
  gracia_hasta?: string;
  abono_cents?: number;
  link?: string | null;
  pagos?: PagoSuscripcion[];
};

/** Días enteros que faltan, redondeando para arriba: "te queda 1 día" hasta el final. */
export function diasHasta(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

const FECHA = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  timeZone: "America/Argentina/Cordoba",
});

/** "2026-11-02T…" → "2 de noviembre" */
export function formatFecha(iso: string | undefined): string {
  return iso ? FECHA.format(new Date(iso)) : "";
}
