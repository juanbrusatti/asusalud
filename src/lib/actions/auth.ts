"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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

  if (error) {
    // Mismo mensaje para usuario inexistente y contraseña incorrecta: decir
    // cuál de los dos falló le confirma a un tercero qué correos existen.
    return { error: "Correo o contraseña incorrectos." };
  }

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
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) return { error: error.message };

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
