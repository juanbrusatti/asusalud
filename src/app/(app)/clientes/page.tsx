import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { fullName, searchClients } from "@/lib/data/clients";
import { formatPhone } from "@/lib/phone";
import { Buscador } from "./_components/buscador";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const { q = "", pagina } = await searchParams;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const page = Math.max(1, Number(pagina) || 1);
  const { clients, total, pageCount } = await searchClients({ query: q, page });

  const buscando = q.trim().length > 0;

  return (
    <>

      <main className="mx-auto grid max-w-4xl gap-5 px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Clientes
            </h1>
            <p className="mt-1 max-w-prose text-[14.5px] text-muted">
              La ficha de cada persona que atendés: cómo contactarla, qué hay
              que tener en cuenta y el seguimiento de sus sesiones.
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/clientes/importar">Importar</Link>
            </Button>
            <Button asChild>
              <Link href="/clientes/nuevo">Nueva ficha</Link>
            </Button>
          </div>
        </header>

        {total === 0 && !buscando ? (
          <EmptyState
            eyebrow="Todavía nada"
            title="Traé tus clientes o cargá la primera ficha"
            action={
              <div className="flex flex-wrap gap-2">
                <Button asChild size="lg">
                  <Link href="/clientes/importar">Importar desde un archivo</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/clientes/nuevo">Cargar una a mano</Link>
                </Button>
              </div>
            }
          >
            <p>
              Si venís de otro sistema, exportá tus clientes a Excel o CSV y
              traelos de una vez: el importador te deja revisar todo antes de
              guardar nada.
            </p>
          </EmptyState>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Buscador initial={q} />
              <p className="shrink-0 text-[13px] tabular-nums text-muted">
                {total.toLocaleString("es-AR")}{" "}
                {total === 1 ? "ficha" : "fichas"}
              </p>
            </div>

            {clients.length === 0 ? (
              <p className="rounded-card border-[1.5px] border-line bg-surface px-5 py-8 text-center text-[14.5px] text-muted">
                No encontramos a nadie con “{q}”. Probá con el apellido o con
                los últimos números del teléfono.
              </p>
            ) : (
              <ul className="grid gap-2">
                {clients.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/clientes/${c.id}`}
                      className="flex items-center gap-4 rounded-card border-[1.5px] border-line bg-surface px-4 py-3.5 hover:border-accent"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-[15px] font-semibold">
                            {fullName(c)}
                          </p>
                          {c.alert && (
                            <span className="rounded-pill bg-warn-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                              Atención
                            </span>
                          )}
                          {c.channel_mode !== "auto" && (
                            <span className="rounded-pill bg-accent-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent-text">
                              {c.channel_mode === "none"
                                ? "Sin avisos"
                                : c.channel_mode}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-muted">
                          {formatPhone(c.phone_e164) ??
                            c.phone_raw ??
                            c.email ??
                            "Sin datos de contacto"}
                        </p>
                      </div>

                      {c.legacy_visits_count !== null && (
                        <p className="shrink-0 text-right text-[12.5px] tabular-nums text-faint">
                          {c.legacy_visits_count} turnos
                          <br />
                          anteriores
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {pageCount > 1 && (
              <nav
                className="flex items-center justify-between gap-3"
                aria-label="Paginación"
              >
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={page <= 1 ? "pointer-events-none opacity-40" : ""}
                >
                  <Link
                    href={`/clientes?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(page - 1) })}`}
                  >
                    Anterior
                  </Link>
                </Button>

                <p className="text-[13px] tabular-nums text-muted">
                  Página {page} de {pageCount}
                </p>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className={
                    page >= pageCount ? "pointer-events-none opacity-40" : ""
                  }
                >
                  <Link
                    href={`/clientes?${new URLSearchParams({ ...(q ? { q } : {}), pagina: String(page + 1) })}`}
                  >
                    Siguiente
                  </Link>
                </Button>
              </nav>
            )}
          </>
        )}
      </main>
    </>
  );
}
