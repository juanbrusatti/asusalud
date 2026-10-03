/**
 * Lo que sale Dlay, en un solo lugar.
 *
 * La portada, la calculadora y las pantallas de adentro tiran de acá. Si el
 * precio cambia, cambia acá y en la base (`billing_settings.fixed_cents`), y
 * en ningún otro lado: un número repetido en tres textos es un número que
 * tarde o temprano dice tres cosas distintas.
 */

/** El abono mensual, en centavos: $10.000. */
export const ABONO_MENSUAL_CENTS = 1_000_000;

/**
 * Lo que Meta cobra hoy por un mensaje de utilidad —un recordatorio—, en
 * centavos. No lo cobra Dlay: sale contra la tarjeta que el negocio carga en
 * su cuenta de WhatsApp. Es el mismo valor de fábrica que usa la base en
 * `messaging_settings.whatsapp_utility_cents`.
 */
export const COSTO_MENSAJE_META_CENTS = 3_768;

/** Los días gratis desde que se crea la cuenta. */
export const DIAS_DE_PRUEBA = 30;

/** Los días para pagar una vez vencido, antes de que se suspenda. */
export const DIAS_PARA_PAGAR = 5;
