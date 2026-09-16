/**
 * Reemplaza los huecos de una plantilla por los datos reales.
 *
 * Las plantillas admiten {{cliente}}, {{fecha}}, {{hora}}, {{cuando}},
 * {{servicio}}, {{estetica}}, {{link}} y {{preparacion}}. Lo que no se conoce
 * se reemplaza
 * por vacío y no por el texto del hueco: a nadie le tiene que llegar un
 * mensaje que diga "{{servicio}}".
 */

export type RenderContext = {
  clientName: string;
  tenantName: string;
  tenantTimezone: string;
  appointmentAt: string | null;
  serviceNames: string | null;
  /** El enlace donde el cliente puede confirmar, mover o cancelar el turno. */
  manageUrl: string | null;
  /** Qué tiene que saber antes de venir, según los servicios del turno. */
  preparation: string | null;
};

/**
 * Con qué se reemplaza un hueco vacío en WhatsApp.
 *
 * Meta rechaza los parámetros vacíos: la plantilla aprobada espera N valores y
 * cada uno tiene que traer algo. En los otros canales un hueco vacío se limpia
 * y no pasa nada, pero acá el mensaje entero se cae.
 *
 * Por eso cada hueco tiene con qué llenarse, y el último recurso es una raya:
 * fea, pero entrega el mensaje. Un recordatorio con una raya llega; uno
 * rechazado por Meta no llega nunca y nadie se entera.
 */
const RELLENO_WHATSAPP: Record<string, string> = {
  preparacion: "Cualquier duda, escribinos.",
  servicio: "tu turno",
  cuando: "la fecha acordada",
};

function formatDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function render(template: string, ctx: RenderContext): string {
  const values: Record<string, string> = {
    cliente: ctx.clientName.split(" ")[0] ?? ctx.clientName,
    estetica: ctx.tenantName,
    fecha: ctx.appointmentAt
      ? formatDate(ctx.appointmentAt, ctx.tenantTimezone)
      : "",
    hora: ctx.appointmentAt
      ? formatTime(ctx.appointmentAt, ctx.tenantTimezone)
      : "",
    /**
     * Fecha y hora en un solo hueco.
     *
     * No es azúcar: Meta rechaza las plantillas con muchas variables para el
     * largo del texto, y juntar estas dos saca una sin perder nada. De paso
     * se lee mejor: «martes 17 de septiembre a las 15:00» en lugar de una
     * fecha y una hora sueltas separadas por palabras de relleno.
     */
    cuando: ctx.appointmentAt
      ? `${formatDate(ctx.appointmentAt, ctx.tenantTimezone)} a las ` +
        formatTime(ctx.appointmentAt, ctx.tenantTimezone)
      : "",
    servicio: ctx.serviceNames ?? "",
    link: ctx.manageUrl ?? "",
    preparacion: ctx.preparation ?? "",
  };

  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? "")
    // Un hueco vacío puede dejar espacios dobles o un espacio antes del punto.
    .replace(/ {2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Los valores en el orden en que los espera una plantilla de WhatsApp.
 *
 * Meta no recibe el texto: recibe la plantilla aprobada más sus parámetros
 * numerados. El orden lo define la plantilla cargada en Meta, y tiene que
 * coincidir con el orden en que aparecen los huecos en el cuerpo que guardamos.
 */
export function templateParameters(
  template: string,
  ctx: RenderContext,
): string[] {
  const values: Record<string, string> = {
    cliente: ctx.clientName.split(" ")[0] ?? ctx.clientName,
    estetica: ctx.tenantName,
    fecha: ctx.appointmentAt
      ? formatDate(ctx.appointmentAt, ctx.tenantTimezone)
      : "",
    hora: ctx.appointmentAt
      ? formatTime(ctx.appointmentAt, ctx.tenantTimezone)
      : "",
    /**
     * Fecha y hora en un solo hueco.
     *
     * No es azúcar: Meta rechaza las plantillas con muchas variables para el
     * largo del texto, y juntar estas dos saca una sin perder nada. De paso
     * se lee mejor: «martes 17 de septiembre a las 15:00» en lugar de una
     * fecha y una hora sueltas separadas por palabras de relleno.
     */
    cuando: ctx.appointmentAt
      ? `${formatDate(ctx.appointmentAt, ctx.tenantTimezone)} a las ` +
        formatTime(ctx.appointmentAt, ctx.tenantTimezone)
      : "",
    servicio: ctx.serviceNames ?? "",
    link: ctx.manageUrl ?? "",
    preparacion: ctx.preparation ?? "",
  };

  const found: string[] = [];
  for (const match of template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    const key = match[1];
    const valor = (values[key] ?? "").trim();
    // Nunca vacío: Meta rechaza el mensaje entero si falta un parámetro.
    found.push(valor || RELLENO_WHATSAPP[key] || "—");
  }
  return found;
}
