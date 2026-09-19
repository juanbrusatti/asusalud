/**
 * Reemplaza los huecos de una plantilla por los datos reales.
 *
 * Las plantillas admiten {{cliente}}, {{fecha}}, {{hora}}, {{cuando}},
 * {{servicio}}, {{estetica}}, {{link}} y {{mensaje}}. Lo que no se conoce
 * se reemplaza por vacío y no por el texto del hueco: a nadie le tiene que
 * llegar un mensaje que diga "{{servicio}}".
 *
 * {{mensaje}} es el texto que cada servicio escribe para sí, y adentro puede
 * usar los otros huecos: «Hola {{cliente}}, te esperamos el {{cuando}}» cargado
 * en el servicio llega armado. Se resuelve en dos pasadas —primero el texto del
 * servicio, después la plantilla— y por eso un {{mensaje}} adentro de sí mismo
 * no se expande: no hay tercera pasada y la recursión no puede empezar.
 */

export type RenderContext = {
  clientName: string;
  tenantName: string;
  tenantTimezone: string;
  appointmentAt: string | null;
  serviceNames: string | null;
  /** El enlace donde el cliente puede confirmar, mover o cancelar el turno. */
  manageUrl: string | null;
  /** El mensaje propio de los servicios del turno. */
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
  mensaje: "Cualquier duda, escribinos.",
  preparacion: "Cualquier duda, escribinos.",
  servicio: "tu turno",
  cuando: "la fecha acordada",
};

const HUECO = /\{\{\s*(\w+)\s*\}\}/g;

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

/** Rellena los huecos de un texto y deja la puntuación presentable. */
function completar(texto: string, values: Record<string, string>): string {
  return texto
    .replace(HUECO, (_, key: string) => values[key] ?? "")
    // Un hueco vacío puede dejar espacios dobles o un espacio antes del punto.
    .replace(/ {2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Los datos del turno, sin el mensaje del servicio.
 *
 * Es lo que se usa para armar ese mensaje antes de meterlo en la plantilla.
 */
function datosDelTurno(ctx: RenderContext): Record<string, string> {
  return {
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
  };
}

/** Todos los valores, con el mensaje del servicio ya armado. */
function valores(ctx: RenderContext): Record<string, string> {
  const base = datosDelTurno(ctx);
  const mensaje = completar(ctx.preparation ?? "", base);
  // `preparacion` sigue vivo: hay plantillas aprobadas en Meta que lo usan, y
  // el nombre de una plantilla de WhatsApp no se cambia sin volver a la cola.
  return { ...base, mensaje, preparacion: mensaje };
}

export function render(template: string, ctx: RenderContext): string {
  return completar(template, valores(ctx));
}

/**
 * Deja un valor como Meta lo acepta dentro de un parámetro.
 *
 * Un parámetro no puede traer saltos de línea, tabulaciones ni cuatro espacios
 * seguidos: Meta rechaza el envío entero. El mensaje del servicio lo escribe
 * una persona en un cuadro de texto de tres renglones, así que tarde o
 * temprano va a apretar Enter. Sin esto, ese Enter no desacomoda el mensaje:
 * lo hace desaparecer.
 */
function paraMeta(valor: string): string {
  return valor.replace(/\s+/g, " ").trim();
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
  const values = valores(ctx);

  const found: string[] = [];
  for (const match of template.matchAll(HUECO)) {
    const key = match[1];
    const valor = paraMeta(values[key] ?? "");
    // Nunca vacío: Meta rechaza el mensaje entero si falta un parámetro.
    found.push(valor || RELLENO_WHATSAPP[key] || "—");
  }
  return found;
}
