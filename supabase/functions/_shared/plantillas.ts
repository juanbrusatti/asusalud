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
  mensaje: "No te depiles con cera ni pinza 15 días antes.",
  // El nombre viejo del mismo hueco, por si alguien lo escribe a mano.
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


/**
 * El mismo número argentino, sin el 9 de los móviles.
 *
 * Meta tiene dos comportamientos distintos y no lo dice en ningún lado:
 *
 *   · EN PRODUCCIÓN acepta las dos formas y agrega el 9 solo. Mandar
 *     «+5493584178955» es lo correcto y es lo que entrega.
 *   · CON EL NÚMERO DE PRUEBA, la lista de destinatarios permitidos compara
 *     sin el 9. El mismo teléfono cargado ahí es «543584178955», y mandarlo
 *     con el 9 devuelve «131030: not in allowed list» aunque esté cargado.
 *
 * Devuelve null si no es un móvil argentino, para no tocar lo que no hay que
 * tocar.
 */
export function sinNueveArgentino(telefono: string): string | null {
  const limpio = telefono.replace(/\D/g, "");
  if (!limpio.startsWith("549")) return null;
  return `54${limpio.slice(3)}`;
}
