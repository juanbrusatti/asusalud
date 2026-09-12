/**
 * Reemplaza los huecos de una plantilla por los datos reales.
 *
 * Las plantillas admiten {{cliente}}, {{fecha}}, {{hora}}, {{servicio}},
 * {{estetica}} y {{link}}. Lo que no se conoce se reemplaza por vacío y no por
 * el texto del hueco: a nadie le tiene que llegar un mensaje que diga
 * "{{servicio}}".
 */

export type RenderContext = {
  clientName: string;
  tenantName: string;
  tenantTimezone: string;
  appointmentAt: string | null;
  serviceNames: string | null;
  /** El enlace donde la clienta puede confirmar, mover o cancelar el turno. */
  manageUrl: string | null;
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
    servicio: ctx.serviceNames ?? "",
    link: ctx.manageUrl ?? "",
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
    servicio: ctx.serviceNames ?? "",
    link: ctx.manageUrl ?? "",
  };

  const found: string[] = [];
  for (const match of template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    found.push(values[match[1]] ?? "");
  }
  return found;
}
