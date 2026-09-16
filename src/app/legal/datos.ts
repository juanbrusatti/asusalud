/**
 * Los datos de la empresa, en un solo lugar.
 *
 * Meta compara lo que dice el sitio con lo que se declara en la verificación
 * del negocio: si el nombre, el domicilio o el contacto no coinciden, la
 * verificación se rechaza. Por eso viven acá y no sueltos en cada página:
 * se corrigen una vez y quedan iguales en todas.
 */
export const EMPRESA = {
  /** Razón social, tal cual figura en los papeles que ve Meta. */
  razonSocial: "Dlay",
  /** El nombre con el que se conoce al producto. */
  nombre: "Dlay Agenda",
  /** Domicilio, tal cual figura en los papeles. */
  domicilio: "Río Cuarto, Córdoba, Argentina",
  /** Casilla a la que llegan los pedidos de datos. Tiene que existir. */
  correo: "hola@dlay.com.ar",
  /** El sitio, sin barra al final. */
  sitio: "https://dlay.com.ar",
} as const;

/** La fecha que se muestra como última actualización de los textos legales. */
export const VIGENCIA = "16 de septiembre de 2026";
