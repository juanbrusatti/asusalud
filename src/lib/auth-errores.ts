/**
 * Lo que dice Supabase cuando algo falla al entrar o al crear la cuenta, en
 * castellano y diciendo qué hacer.
 *
 * Supabase contesta en inglés («User already registered») y la pantalla lo
 * mostraba tal cual. Para quien está creando la cuenta de su negocio, eso es
 * un cartel en otro idioma justo en el primer minuto. Se traduce por el
 * código del error y no por el texto, que Supabase puede cambiar sin avisar.
 */

/** El error al crear una cuenta. */
export function mensajeDeAlta(codigo: string | undefined): string {
  switch (codigo) {
    case "user_already_exists":
    case "email_exists":
      return "Ya hay una cuenta con ese correo. Entrá con tu contraseña, o pedí una nueva si no te la acordás.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
    case "weak_password":
      return "Esa contraseña es muy fácil de adivinar. Probá con una más larga, mezclando letras y números.";
    case "email_address_invalid":
    case "validation_failed":
      return "Revisá el correo: parece que falta algo.";
    case "signup_disabled":
      return "Por ahora no se pueden crear cuentas nuevas. Escribinos y te ayudamos.";
    default:
      return "No se pudo crear la cuenta. Probá de nuevo en unos minutos.";
  }
}

/**
 * El error al entrar.
 *
 * Usuario inexistente y contraseña incorrecta dicen lo mismo a propósito:
 * distinguirlos le confirma a cualquiera qué correos tienen cuenta. El correo
 * sin confirmar sí se dice aparte, porque Supabase sólo lo informa cuando la
 * contraseña es correcta, y sin ese aviso la persona cree que se equivocó de
 * clave y nunca va a buscar el mail.
 */
export function mensajeDeIngreso(codigo: string | undefined): string {
  switch (codigo) {
    case "email_not_confirmed":
      return "Todavía no confirmaste tu correo. Buscá el mail que te mandamos al crear la cuenta y tocá el enlace; mirá también en el correo no deseado.";
    case "over_request_rate_limit":
      return "Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
    default:
      return "Correo o contraseña incorrectos.";
  }
}
