/**
 * Cómo se traduce una plantilla nuestra a una de Meta.
 *
 * Vive aparte del emisor para poder probarlo: acá no hay nada de Deno, así que
 * la suite de pruebas lo importa igual que a `render.ts`.
 */

/** Lo que el cliente lee en cada botón. */
export const ETIQUETA_BOTON: Record<string, string> = {
  confirmar: "Confirmar turno",
  cancelar: "Cancelar turno",
  reprogramar: "Cambiar horario",
  baja: "No me escriban más",
};

/** Un ejemplo para cada hueco. Meta exige uno y rechaza la plantilla sin él. */
const EJEMPLO: Record<string, string> = {
  cliente: "Mirián",
  estetica: "Estética Asusalud",
  fecha: "lunes 14 de septiembre",
  hora: "09:00",
  cuando: "lunes 14 de septiembre a las 09:00",
  servicio: "depilación definitiva",
  preparacion: "No te depiles con cera ni pinza 15 días antes.",
  link: "https://dlay.app/t/a1b2c3",
};

/**
 * Traduce nuestro cuerpo al que entiende Meta.
 *
 * Nosotros escribimos {{cliente}} porque un humano tiene que poder leer la
 * plantilla; Meta numera los huecos: {{1}}, {{2}}. El orden es el de aparición
 * y tiene que ser el mismo que usa el emisor al mandar los parámetros — si se
 * desalinea, el mensaje sale con la hora en el lugar del nombre.
 */
export function paraMeta(cuerpo: string): { texto: string; ejemplos: string[] } {
  const ejemplos: string[] = [];
  let n = 0;

  const texto = cuerpo.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, clave: string) => {
      n += 1;
      ejemplos.push(EJEMPLO[clave] ?? "ejemplo");
      return `{{${n}}}`;
    },
  );

  return { texto, ejemplos };
}

