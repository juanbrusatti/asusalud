/**
 * Campos que el importador sabe cargar, y los encabezados con los que suelen
 * venir. La detección automática ahorra el paso más tedioso: quien exporta de
 * otro sistema no debería tener que explicar qué significa cada columna.
 */

export const FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "documentId",
  "birthdate",
  "legacyVisits",
  "legacyTotal",
  "legacyLastVisit",
  "notes",
] as const;

export type Field = (typeof FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  firstName: "Nombre",
  lastName: "Apellido",
  phone: "Teléfono",
  email: "Correo",
  documentId: "Documento",
  birthdate: "Cumpleaños",
  legacyVisits: "Turnos anteriores",
  legacyTotal: "Total gastado antes",
  legacyLastVisit: "Última visita anterior",
  notes: "Nota inicial",
};

export const FIELD_HINTS: Partial<Record<Field, string>> = {
  firstName: "Es lo único obligatorio.",
  phone: "Se normaliza solo al formato internacional.",
  legacyVisits:
    "Cuántos turnos hizo en tu sistema anterior. Se guarda aparte del historial nuevo.",
  legacyTotal: "Cuánto gastó en total en tu sistema anterior.",
};

/** Encabezados conocidos, en minúsculas y sin acentos. */
const ALIASES: Record<Field, string[]> = {
  firstName: ["nombre", "nombres", "first name", "firstname", "name", "cliente"],
  lastName: ["apellido", "apellidos", "last name", "lastname", "surname"],
  phone: [
    "telefono",
    "tel",
    "celular",
    "movil",
    "whatsapp",
    "phone",
    "mobile",
    "numero",
    "contacto",
  ],
  email: ["email", "e-mail", "correo", "mail", "correo electronico"],
  documentId: ["dni", "documento", "doc", "cuit", "cuil", "id"],
  birthdate: [
    "cumpleanos",
    "cumple",
    "nacimiento",
    "fecha de nacimiento",
    "birthdate",
    "birthday",
  ],
  legacyVisits: ["turnos", "cantidad de turnos", "visitas", "sesiones", "citas"],
  legacyTotal: [
    "total",
    "facturado",
    "total facturado",
    "gastado",
    "total gastado",
    "importe",
  ],
  legacyLastVisit: [
    "ultimo turno",
    "ultima visita",
    "ultima sesion",
    "last visit",
  ],
  notes: ["nota", "notas", "observaciones", "comentarios", "obs"],
};

function normalize(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿El encabezado contiene este alias como palabra completa?
 *
 * Buscar el alias como simple subcadena falla feo: "id" aparece dentro de
 * "cantidad", y "Cantidad de turnos" terminaba mapeada a Documento. Comparar
 * palabras completas evita toda esa familia de errores.
 */
function matchesAlias(headerWords: string[], alias: string): boolean {
  const aliasWords = alias.split(" ");

  if (aliasWords.length === 1) {
    return headerWords.includes(alias);
  }

  // Alias de varias palabras: tienen que aparecer seguidas y en orden.
  for (let i = 0; i <= headerWords.length - aliasWords.length; i += 1) {
    if (aliasWords.every((w, j) => headerWords[i + j] === w)) return true;
  }
  return false;
}

/**
 * Adivina qué campo corresponde a cada encabezado del archivo. Devuelve un
 * mapa columna → campo; lo que no reconoce queda sin asignar para que la
 * persona lo resuelva a mano.
 *
 * Se hacen dos pasadas: primero las coincidencias exactas, después las
 * parciales. Así "Teléfono" se lleva el campo antes de que "Teléfono de
 * emergencia" se lo robe por aparecer primero en el archivo.
 */
export function guessMapping(headers: string[]): Record<number, Field | null> {
  const used = new Set<Field>();
  const mapping: Record<number, Field | null> = {};
  const clean = headers.map(normalize);

  headers.forEach((_, index) => {
    mapping[index] = null;
  });

  // Pasada 1: el encabezado es exactamente uno de los alias conocidos.
  clean.forEach((header, index) => {
    if (!header) return;
    for (const field of FIELDS) {
      if (used.has(field)) continue;
      if (ALIASES[field].includes(header)) {
        mapping[index] = field;
        used.add(field);
        return;
      }
    }
  });

  // Pasada 2: el alias aparece como palabra completa dentro del encabezado.
  clean.forEach((header, index) => {
    if (!header || mapping[index]) return;
    const words = header.split(" ");
    for (const field of FIELDS) {
      if (used.has(field)) continue;
      if (ALIASES[field].some((alias) => matchesAlias(words, alias))) {
        mapping[index] = field;
        used.add(field);
        return;
      }
    }
  });

  return mapping;
}
