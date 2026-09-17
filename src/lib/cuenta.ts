/**
 * Lo que Dlay le cobra a cada negocio: las formas y el formato.
 *
 * Vive fuera de `data/` porque de acá tira también el panel, que es cliente.
 * Lo que consulta la base está en `data/cuenta.ts`, que sí es sólo servidor.
 */

export type MesCobrado = {
  periodo: string;
  cantidad: number;
  total_cents: number;
  pagado: boolean;
  pagado_el: string | null;
};

export type Cuenta = {
  precio_cents: number;
  mes_actual: { periodo: string; cantidad: number; total_cents: number };
  meses: MesCobrado[];
};

export type MesPendiente = {
  periodo: string;
  cantidad: number;
  total_cents: number;
};

export type NegocioPlataforma = {
  tenant_id: string;
  nombre: string;
  slug: string;
  estado: string;
  creado: string;
  precio_cents: number;
  mes_actual: { periodo: string; cantidad: number; total_cents: number };
  pendientes: MesPendiente[];
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
