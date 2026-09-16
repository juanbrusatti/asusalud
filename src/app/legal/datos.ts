/**
 * Los datos de la empresa, en un solo lugar.
 *
 * Meta compara lo que dice el sitio con lo que se declara en la verificación
 * del negocio: si el nombre, el domicilio o el contacto no coinciden, la
 * verificación se rechaza. Por eso viven acá y no sueltos en cada página:
 * se corrigen una vez y quedan iguales en todas.
 */
export const EMPRESA = {
  /** El nombre con el que se conoce al producto. */
  nombre: "Dlay Agenda",
  /**
   * La marca. Es el nombre que puede ir como nombre visible del portafolio
   * en Meta, que no tiene por qué ser el nombre legal.
   */
  razonSocial: "Dlay",
  /**
   * Quién responde legalmente, con su CUIT.
   *
   * Va vacío mientras Dlay no sea una sociedad inscripta: en ese caso el
   * titular es la persona humana que factura, y tiene que decir exactamente
   * lo que dice la constancia de ARCA, porque es el papel que mira Meta.
   * Una política de privacidad que nombra a una empresa que no existe en
   * ningún registro no protege a nadie.
   */
  titular: "Juan Máximo Molina Brusatti",
  cuit: "20-44606672-3",
  /** Domicilio, tal cual figura en los papeles. */
  domicilio: "Ituzaingó 1608, Río Cuarto, Córdoba, Argentina",
  /** Casilla a la que llegan los pedidos de datos. Tiene que existir. */
  correo: "dlay.software.contact@gmail.com",
  /** El sitio, sin barra al final. */
  sitio: "https://dlay-agenda.vercel.app",
};

/** La fecha que se muestra como última actualización de los textos legales. */
export const VIGENCIA = "16 de septiembre de 2026";
