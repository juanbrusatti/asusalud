import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneResult = {
  /** Formato internacional, listo para enviar. Null si no se pudo interpretar. */
  e164: string | null;
  /** Cómo se muestra en pantalla: "+54 9 358 412-3456". */
  display: string | null;
  /**
   * True cuando el número venía sin el 15 ni el 9 y lo tratamos como celular.
   * La interfaz lo avisa para que alguien pueda corregirlo.
   */
  assumedMobile: boolean;
  /** Qué salió mal, en palabras que sirvan para arreglarlo. */
  error: string | null;
};

const DEFAULT_COUNTRY = "AR" as const;

/**
 * Normaliza un teléfono argentino a formato internacional.
 *
 * El detalle que rompe todo si se ignora: **WhatsApp exige el 9** en los
 * celulares argentinos. "+543584123456" es un fijo y el mensaje no llega;
 * "+5493584123456" es el mismo número como celular y sí llega.
 *
 * Quien escribe "0358 15 412-3456" ya dijo que es celular (el 15 lo indica) y
 * la librería resuelve sola. Pero "3584123456" es ambiguo: puede ser fijo o
 * celular. Para la clientela de un negocio es celular casi siempre, así que
 * asumimos eso y lo marcamos, en vez de guardar un número que no va a recibir
 * nada.
 */
export function normalizePhone(
  raw: string,
  options: { isMobile?: boolean } = {},
): PhoneResult {
  const input = raw.trim();

  if (!input) {
    return { e164: null, display: null, assumedMobile: false, error: null };
  }

  const parsed = parsePhoneNumberFromString(input, DEFAULT_COUNTRY);

  if (!parsed) {
    return {
      e164: null,
      display: null,
      assumedMobile: false,
      error: "No pudimos interpretar el número. Escribilo con característica.",
    };
  }

  const isArgentina = parsed.country === "AR" || parsed.countryCallingCode === "54";
  const national = parsed.nationalNumber;
  const treatAsMobile = options.isMobile ?? true;

  // Fuera de Argentina no hay nada que inferir: si es válido, se usa.
  if (!isArgentina) {
    if (!parsed.isValid()) {
      return {
        e164: null,
        display: null,
        assumedMobile: false,
        error: "El número no parece válido para ese país.",
      };
    }
    return {
      e164: parsed.number,
      display: parsed.formatInternational(),
      assumedMobile: false,
      error: null,
    };
  }

  const alreadyMobile = national.startsWith("9");

  if (alreadyMobile || !treatAsMobile) {
    if (!parsed.isValid()) {
      return {
        e164: null,
        display: null,
        assumedMobile: false,
        error:
          "Faltan dígitos o sobra alguno. Revisá la característica y el número.",
      };
    }
    return {
      e164: parsed.number,
      display: parsed.formatInternational(),
      assumedMobile: false,
      error: null,
    };
  }

  // Ambiguo: lo convertimos a celular agregando el 9.
  const withNine = parsePhoneNumberFromString(`+54 9 ${national}`);

  if (!withNine?.isValid()) {
    return {
      e164: null,
      display: null,
      assumedMobile: false,
      error:
        "No parece un celular válido. Probá escribirlo con el 15, por ejemplo 0358 15 412-3456.",
    };
  }

  return {
    e164: withNine.number,
    display: withNine.formatInternational(),
    assumedMobile: true,
    error: null,
  };
}

/** Para mostrar en pantalla un número ya guardado. */
export function formatPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.formatInternational() ?? e164;
}

/** Enlace para abrir el chat. WhatsApp espera el número sin el "+". */
export function whatsappLink(e164: string | null | undefined): string | null {
  if (!e164) return null;
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}
