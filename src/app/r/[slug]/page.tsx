import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { getBookingPage } from "@/lib/data/reserva";
import { publicEnv } from "@/lib/env";
import { Reservar } from "./_components/reservar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getBookingPage(slug);

  return page
    ? {
        title: `Reservá tu turno en ${page.tenant.name}`,
        description: `Elegí el servicio, el día y el horario que te quede cómodo.`,
      }
    : { title: "Reservar turno" };
}

/**
 * La página pública de reservas.
 *
 * Es lo único del sistema que ve alguien sin cuenta. No muestra nada de la
 * estética más allá de lo necesario para reservar: ni la agenda, ni quién
 * ocupa los otros horarios, ni cuántas clientas tiene.
 */
export default async function ReservarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getBookingPage(slug);

  // Misma respuesta si la estética no existe o si todavía no abrió su agenda:
  // decir cuál de las dos es filtra información que no hace falta dar.
  if (!page) notFound();

  return (
    <main className="mx-auto grid max-w-xl gap-5 px-4 py-10">
      <RegisterServiceWorker />

      <header className="grid gap-3">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.035em]">
          Reservá tu turno en{" "}
          <span className="font-hand text-[40px] leading-none text-accent-text">
            {page.tenant.name}
          </span>
        </h1>

        {page.settings.welcomeText && (
          <p className="max-w-prose text-[15px] leading-relaxed text-muted">
            {page.settings.welcomeText}
          </p>
        )}
        {page.settings.addressNote && (
          <p className="text-[13.5px] text-muted">{page.settings.addressNote}</p>
        )}
      </header>

      {page.services.length === 0 ? (
        <p className="rounded-card border-[1.5px] border-line bg-surface px-5 py-8 text-center text-[14.5px] text-muted">
          Todavía no hay servicios disponibles para reservar online.
        </p>
      ) : (
        <Reservar
          page={page}
          vapidPublicKey={publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        />
      )}

      <footer className="flex items-center justify-center gap-2 pt-4 text-[12.5px] text-faint">
        <Logo className="h-5 w-5" />
        <span>Turnos con Dlay</span>
      </footer>
    </main>
  );
}
