"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajeDeAlta, mensajeDeIngreso } from "@/lib/auth-errores";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export type FormState = { error: string | null; notice?: string | null };

const credentials = z.object({
  email: z.string().email("Revisá el correo: parece que falta algo."),
  password: z
    .string()
    .min(8, "La contraseña tiene que tener al menos 8 caracteres."),
});

const signUpSchema = credentials.extend({
  fullName: z.string().min(2, "Escribí tu nombre y apellido."),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisá los datos.";
}

/**
 * A dónde mandar después de entrar.
 *
 * Sólo rutas de esta aplicación. Sin esta comprobación, un enlace armado como
 * `/entrar?volver=https://otro-sitio.com` manda a alguien recién autenticado a
 * un sitio ajeno con cara de que lo mandamos nosotros.
 */
function destino(formData: FormData): string {
  const volver = String(formData.get("volver") ?? "");
  return /^\/(?!\/)/.test(volver) ? volver : "/";
}

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) return { error: mensajeDeIngreso(error.code) };

  revalidatePath("/", "layout");
  redirect(destino(formData));
}

export async function signUp(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      // Sin esto el enlace del mail vuelve a la Site URL —la portada— con un
      // código que nadie canjea: el correo queda confirmado pero la persona
      // cae en la página de ventas sin sesión. `/auth/confirmar` lo canjea y
      // la deja adentro, lista para crear su negocio.
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirmar?next=/&alta=1`,
    },
  });

  if (error) return { error: mensajeDeAlta(error.code) };

  // Con la confirmación de correo encendida —como está en producción—
  // Supabase crea la cuenta pero no abre sesión: la abre el enlace del mail.
  // Antes se redirigía igual, a `/`, que sin sesión es la portada pública: la
  // persona terminaba en la página de ventas sin saber que tenía un correo
  // esperándola, que es la forma más corta de perder un negocio recién llegado.
  if (!data.session) {
    return {
      error: null,
      notice:
        `Listo, te mandamos un correo a ${parsed.data.email}. Abrilo y tocá ` +
        "el enlace para entrar a tu cuenta. Si en unos minutos no lo ves, " +
        "mirá en el correo no deseado.",
    };
  }

  revalidatePath("/", "layout");
  redirect(destino(formData));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/entrar");
}

/**
 * Pedir el correo para poner una contraseña nueva.
 *
 * Contesta lo mismo exista o no la cuenta. Decir «ese correo no está» le
 * confirma a cualquiera qué direcciones tienen cuenta en Dlay.
 */
export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!z.string().email().safeParse(email).success) {
    return { error: "Revisá el correo: parece que falta algo." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirmar`,
  });

  return {
    error: null,
    notice:
      "Si esa dirección tiene una cuenta, le va a llegar un correo con el " +
      "enlace para poner una contraseña nueva. Mirá también el correo no deseado.",
  };
}

/** Poner la contraseña nueva. Requiere sesión: la abre el enlace. */
export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (password.length < 8) {
    return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  }
  if (password !== repeat) {
    return { error: "Las dos contraseñas no coinciden." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "El enlace venció o ya se usó. Pedí uno nuevo desde «Olvidé mi contraseña».",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo cambiar la contraseña." };

  revalidatePath("/", "layout");
  redirect("/");
}
