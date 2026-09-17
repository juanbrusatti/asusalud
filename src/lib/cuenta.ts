/**
 * Lo que Dlay le cobra a cada negocio: las formas y el formato.
 *
 * Vive fuera de `data/` porque de acá tira también el panel, que es cliente.
 * Lo que consulta la base está en `data/cuenta.ts`, que sí es sólo servidor.
 */

/** Lo facturado y lo que sale de ahí, para un mes. */
export type MesBase = {
  periodo: string;
  cantidad: number;
  /** Lo que facturó el negocio ese mes. */
  base_cents: number;
  /** La comisión de Dlay sobre esa base. */
  total_cents: number;
};

export type MesCobrado = MesBase & {
  comision_bps: number;
  pagado: boolean;
  pagado_el: string | null;
  /** El cobro de Mercado Pago, si ya se generó. */
  link: string | null;
};

export type Cuenta = {
  comision_bps: number;
  mes_actual: MesBase;
  meses: MesCobrado[];
};

export type NegocioPlataforma = {
  tenant_id: string;
  nombre: string;
  slug: string;
  estado: string;
  creado: string;
  comision_bps: number;
  mes_actual: MesBase;
  pendientes: MesBase[];
  pendiente_total_cents: number;
  ultimo_pago: { periodo: string; monto_cents: number; fecha: string } | null;
};

const MES = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  // El período viene como "2026-08-01" y se lee como medianoche UTC. Sin esto,
  // en Argentina se mostraría julio.
  timeZone: "UTC",
});

/**
 * "2026-08-01" → "Agosto de 2026"
 *
 * La mayúscula se pone acá y no con CSS: `capitalize` la pondría también en
 * «De», y `first-letter` depende de que la clase sobreviva al armado de los
 * estilos. Una cadena bien formada no depende de nada.
 */
export function formatMes(periodo: string): string {
  const texto = MES.format(new Date(`${periodo}T00:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * El porcentaje se guarda en puntos básicos y entero: 3% es 300.
 *
 * Es la misma disciplina que los centavos. Con coma flotante, un 3,33%
 * aplicado mil veces deja un total que no cierra con ningún papel.
 */

const PORCENTAJE = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 2,
});

/** 300 → "3%"; 333 → "3,33%" */
export function formatComision(bps: number): string {
  return `${PORCENTAJE.format(bps / 100)}%`;
}

/** 300 → "3", para precargar un campo. */
export function bpsToInput(bps: number): string {
  return PORCENTAJE.format(bps / 100);
}

/**
 * Acepta lo que alguien realmente escribe: "3", "3,5", "3.5", "3 %".
 * Devuelve null si no hay un porcentaje usable.
 */
export function parseComisionToBps(raw: string): number | null {
  const limpio = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  if (limpio === "") return null;

  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor < 0 || valor > 100) return null;

  return Math.round(valor * 100);
}
