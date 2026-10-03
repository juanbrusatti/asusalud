import { describe, expect, it } from "vitest";
import { mensajeDeAlta, mensajeDeIngreso } from "../../src/lib/auth-errores";

describe("los errores al crear la cuenta", () => {
  it("dicen qué hacer en castellano, nunca el texto de Supabase", () => {
    // Antes la pantalla mostraba «User already registered» tal cual.
    expect(mensajeDeAlta("user_already_exists")).toMatch(/Ya hay una cuenta/);
    expect(mensajeDeAlta("over_email_send_rate_limit")).toMatch(/Esperá unos minutos/);
    expect(mensajeDeAlta("weak_password")).toMatch(/contraseña/);
  });

  it("un código desconocido da un mensaje genérico y no queda vacío", () => {
    expect(mensajeDeAlta(undefined)).toMatch(/No se pudo crear la cuenta/);
    expect(mensajeDeAlta("algo_nuevo_de_supabase")).toMatch(/No se pudo crear la cuenta/);
  });
});

describe("los errores al entrar", () => {
  it("el correo sin confirmar se dice aparte, para que vaya a buscar el mail", () => {
    expect(mensajeDeIngreso("email_not_confirmed")).toMatch(/confirmaste tu correo/);
  });

  it("usuario inexistente y clave incorrecta dicen lo mismo", () => {
    // Distinguirlos le confirmaría a cualquiera qué correos tienen cuenta.
    expect(mensajeDeIngreso("invalid_credentials")).toBe(mensajeDeIngreso(undefined));
  });
});
