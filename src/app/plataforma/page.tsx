import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardFigure } from "@/components/ui/card";
import { getNegocios } from "@/lib/data/cuenta";
import { formatPrice } from "@/lib/money";
import { Negocio } from "./negocio";

export const metadata: Metadata = { title: "Plataforma" };

/**
 * El panel de Dlay: todos los negocios y lo que deben.
 *
 * Vive fuera del grupo `(app)` a propósito. Ahí adentro todo cuelga de un
 * negocio —la barra, la agenda, los clientes— y esto es justo lo contrario:
 * mira por encima de todos. Meterlo en el mismo lugar sería mostrar la barra
 * de una estética mientras se mira la cuenta de otra.
 *
 * Quien no es de la plataforma no ve un error sino un 404: que ni siquiera se
 * sepa que la pantalla existe.
 */
export default async function PlataformaPage() {
  const negocios = await getNegocios();
  if (!negocios) notFound();

  const enCurso = negocios.reduce((t, n) => t + n.mes_actual.total_cents, 0);
  const pendiente = negocios.reduce((t, n) => t + n.pendiente_total_cents, 0);
  const activos = negocios.filter((n) => n.estado === "active").length;

  return (
    <main className="mx-auto grid max-w-3xl gap-5 px-4 py-8">
      <header>
        <Link
          href="/"
          className="text-[13px] text-muted hover:text-ink"
        >
          ← Volver al sistema
        </Link>
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Plataforma
        </h1>
        <p className="mt-1 max-w-prose text-[14.5px] text-muted">
          Los negocios que usan Dlay, lo que llevan del mes y lo que quedó sin
          cobrar.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card accent>
          <CardBody className="grid gap-1.5">
            <p className="text-[13px] uppercase tracking-wider opacity-75">
              Este mes, hasta hoy
            </p>
            <CardFigure>{formatPrice(enCurso)}</CardFigure>
            <p className="text-[13px] opacity-75">
              {activos} {activos === 1 ? "negocio activo" : "negocios activos"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-1.5">
            <p className="text-[13px] uppercase tracking-wider text-faint">
              Sin cobrar
            </p>
            <CardFigure className="text-accent-text">
              {formatPrice(pendiente)}
            </CardFigure>
            <p className="text-[13px] text-muted">
              De meses ya cerrados.
            </p>
          </CardBody>
        </Card>
      </div>

      {negocios.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-[14px] text-muted">
              Todavía no hay ningún negocio registrado.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-3">
          {negocios.map((n) => (
            <Negocio key={n.tenant_id} negocio={n} />
          ))}
        </div>
      )}

      <p className="px-1 text-[12.5px] leading-relaxed text-faint">
        Un mes se puede marcar como pagado recién cuando termina: mientras está
        en curso le siguen entrando turnos. Al marcarlo se guarda cuánto
        facturó el negocio y con qué porcentaje se cobró, así cambiar la
        comisión después no reescribe lo ya cobrado.
      </p>
    </main>
  );
}
