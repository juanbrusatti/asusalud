import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Calculadora } from "./calculadora";
import { DemoRecordatorio } from "./demo-recordatorio";
import { QueHace } from "./que-hace";

/**
 * La portada: lo único que ve alguien que todavía no sabe qué es Dlay.
 *
 * La apuesta es que el producto se toque antes de crear nada. Casi todas las
 * páginas de este rubro son una captura de pantalla con flechitas y tres
 * testimonios inventados; acá lo que se ve funciona de verdad, con los mismos
 * colores y el mismo lenguaje que va a encontrar adentro. Lo que se promete y
 * lo que se entrega son la misma pantalla.
 *
 * El envoltorio se dibuja en el servidor y sólo las tres piezas que se tocan
 * mandan JavaScript. Pesa poco a propósito: buena parte de esta gente la va a
 * abrir con datos móviles en un local.
 */

function Seccion({
  titulo,
  bajada,
  children,
}: {
  titulo: string;
  bajada?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t-[1.5px] border-line-soft pt-12">
      <div className="grid gap-2">
        <h2 className="max-w-[20ch] text-[26px] font-bold leading-[1.15] tracking-[-0.03em] sm:text-[32px]">
          {titulo}
        </h2>
        {bajada && (
          <p className="max-w-prose text-[15px] leading-relaxed text-muted">
            {bajada}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Portada() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <span className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            Dlay
          </span>
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href="/entrar">Entrar</Link>
        </Button>
      </header>

      <main className="mx-auto grid max-w-5xl gap-14 px-5 pb-20 pt-6 sm:gap-16 sm:pt-10">
        {/* ── Lo primero ─────────────────────────────────────────────── */}
        <section className="grid gap-7">
          <div className="grid gap-4">
            <h1 className="max-w-[15ch] text-[38px] font-bold leading-[1.05] tracking-[-0.04em] sm:text-[56px]">
              Dejá de perseguir confirmaciones por WhatsApp.
            </h1>
            <p className="max-w-[46ch] text-[17px] leading-relaxed text-muted sm:text-[19px]">
              Dlay le recuerda el turno a cada cliente, recibe la respuesta y
              actualiza la agenda sola. Vos atendés.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/entrar">Crear mi cuenta</Link>
            </Button>
            <span className="text-[13.5px] text-faint">
              Gratis hasta que atiendas. No pedimos tarjeta.
            </span>
          </div>

          <div className="grid gap-3 pt-2">
            <p className="font-hand text-[24px] leading-none text-accent-text">
              Probalo acá mismo ↓
            </p>
            <DemoRecordatorio />
          </div>
        </section>

        {/* ── La cuenta ──────────────────────────────────────────────── */}
        <Seccion
          titulo="Hacé la cuenta con tus números, no con los míos."
          bajada="Movés los dos deslizadores y listo. Sin estadísticas de industria ni promedios inventados."
        >
          <Calculadora />
        </Seccion>

        {/* ── Qué hay adentro ────────────────────────────────────────── */}
        <Seccion
          titulo="No es sólo la agenda."
          bajada="Tocá cada parte para verla. Es la pantalla de verdad, no un dibujo."
        >
          <QueHace />
        </Seccion>

        {/* ── El precio ──────────────────────────────────────────────── */}
        <Seccion
          titulo="Si no atendés, no pagás."
          bajada="Dlay se lleva el 3% de lo que facturás. Un turno de $ 1.000 paga el 3% de eso y uno de $ 20.000 también: siempre la misma proporción."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                "Sin abono",
                "No hay cuota fija. Un mes flojo sale barato porque se cobra sobre lo que entró.",
              ],
              [
                "Sin permanencia",
                "Te vas cuando quieras y te llevás tus clientes y tus turnos en un archivo.",
              ],
              [
                "Sin letra chica",
                "Los mensajes de WhatsApp los cobra Meta contra tu propia tarjeta, no nosotros. Te lo decimos antes, no después.",
              ],
            ].map(([titulo, texto]) => (
              <div
                key={titulo}
                className="rounded-card border-[1.5px] border-line bg-surface p-5"
              >
                <p className="text-[15px] font-semibold">{titulo}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                  {texto}
                </p>
              </div>
            ))}
          </div>

          <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
            ¿Preferís un abono fijo y saber todos los meses lo mismo? También se
            puede. Se conversa.
          </p>
        </Seccion>

        {/* ── El cierre ──────────────────────────────────────────────── */}
        <section className="grid gap-5 rounded-card border-[1.5px] border-accent bg-accent p-7 text-on-accent sm:p-10">
          <p className="font-hand text-[40px] leading-none sm:text-[52px]">
            Menos administrar.
            <br />
            Más atender.
          </p>
          <p className="max-w-[44ch] text-[15px] leading-relaxed opacity-90">
            Se arma en una tarde. Si venís de otro sistema, tus clientes se
            importan desde un Excel y no se pierde nada.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-surface text-ink hover:opacity-90"
            >
              <Link href="/entrar">Empezar ahora</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t-[1.5px] border-line-soft px-5 py-8 text-[13px] text-faint">
        <span>Dlay Agenda · Río Cuarto, Córdoba</span>
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          <Link className="hover:text-muted" href="/legal/privacidad">
            Privacidad
          </Link>
          <Link className="hover:text-muted" href="/legal/terminos">
            Términos
          </Link>
          <Link className="hover:text-muted" href="/legal/eliminar-datos">
            Eliminar datos
          </Link>
        </span>
      </footer>
    </div>
  );
}
