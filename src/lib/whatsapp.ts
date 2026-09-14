/**
 * Etiquetas del estado de WhatsApp.
 *
 * Separado de `lib/data` porque la pantalla de conexión es un componente de
 * cliente y no puede arrastrar `next/headers` al navegador.
 */

export const ESTADOS: Record<string, { titulo: string; detalle: string }> = {
  pending: {
    titulo: "Esperando a Meta",
    detalle:
      "Las credenciales están guardadas. Meta todavía no confirmó que el número esté listo para enviar.",
  },
  connected: {
    titulo: "Conectado",
    detalle: "Los recordatorios pueden salir por WhatsApp.",
  },
  flagged: {
    titulo: "Con observaciones",
    detalle:
      "Meta marcó la calidad del número. Conviene revisar los textos de los recordatorios antes de que empeore.",
  },
  restricted: {
    titulo: "Limitado por Meta",
    detalle:
      "El número está enviando menos de lo habitual por decisión de Meta. Suele destrabarse solo si la calidad mejora.",
  },
  disabled: {
    titulo: "Deshabilitado",
    detalle:
      "Meta cortó el envío de este número. Hay que resolverlo desde el panel de Meta antes de volver a intentar.",
  },
};

export const CALIDAD: Record<string, string> = {
  GREEN: "Buena",
  YELLOW: "Regular",
  RED: "Mala",
  UNKNOWN: "Sin datos todavía",
};
