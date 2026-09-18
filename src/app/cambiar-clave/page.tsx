import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { createClient } from "@/lib/supabase/server";
import { FormClave } from "./form";

export const metadata: Metadata = { title: "Nueva contraseña" };

/**
 * Poner una contraseña nueva.
 *
 * Se llega por el enlace de un solo uso, que abre sesión antes de traer acá.
 * También sirve para cambiarla estando adentro, que es la misma pantalla y no
 * hacía falta una segunda.
 */
export default async function CambiarClavePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesión no hay nada que cambiar: el enlace venció o nunca existió.
  if (!user) redirect("/entrar?enlace=vencido");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-12">
      <header className="grid gap-4">
        <Logo className="h-11 w-11" />
        <div>
          <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.035em]">
            Poné una contraseña nueva
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Va a quedar guardada para {user.email}. Con eso entrás la próxima
            vez.
          </p>
        </div>
      </header>

      <FormClave />
    </main>
  );
}
