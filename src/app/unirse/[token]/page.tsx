import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { Unirse } from "./unirse";

export const metadata: Metadata = { title: "Sumarte al equipo" };

/**
 * El otro lado del enlace de invitación.
 *
 * No está en las rutas públicas a propósito: quien llega sin sesión lo manda
 * el guardia a entrar, y vuelve acá con el `volver` que ahora sí se respeta.
 * Así el enlace funciona igual para alguien que ya tiene cuenta y para alguien
 * que la crea en ese momento.
 */
export default async function UnirsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-12">
      <header className="grid gap-4">
        <Logo className="h-11 w-11" />
        <div>
          <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.035em]">
            Te sumaron a un equipo
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Al aceptar vas a ver la agenda y los clientes de ese negocio, con
            los permisos que te hayan dado.
          </p>
        </div>
      </header>

      <Unirse token={token} />
    </main>
  );
}
