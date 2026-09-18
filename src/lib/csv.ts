/**
 * Armar un CSV que Excel abra bien en castellano.
 *
 * Dos decisiones que parecen manías y no lo son:
 *
 * · **Punto y coma, no coma.** Excel en configuración regional argentina usa
 *   la coma como separador decimal, así que con comas mete todo en una sola
 *   columna. Quien exporta va a abrir esto en Excel, no en un editor de texto.
 *
 * · **La marca de orden al principio.** Sin esos tres bytes, Excel lee el
 *   archivo como si fuera de los años noventa y «Jesús» aparece como «JesÃºs».
 */

const BOM = "﻿";

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  const texto = String(valor);

  // Un valor que empieza con =, +, - o @ lo interpreta Excel como fórmula.
  // Con datos que escribió un desconocido —el nombre de quien reservó online—
  // eso es una puerta abierta, así que se neutraliza con un apóstrofo.
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;

  return `"${seguro.replace(/"/g, '""')}"`;
}

export function armarCsv(
  columnas: string[],
  filas: unknown[][],
): string {
  const lineas = [columnas.map(celda).join(";")];
  for (const fila of filas) lineas.push(fila.map(celda).join(";"));
  return BOM + lineas.join("\r\n") + "\r\n";
}

/** La respuesta lista para que el navegador la baje. */
export function respuestaCsv(nombre: string, contenido: string): Response {
  return new Response(contenido, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre}"`,
      // Datos de clientes: que no quede en ninguna caché intermedia.
      "cache-control": "no-store",
    },
  });
}
