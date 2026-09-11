import Link from "next/link";
import type { Metadata } from "next";
import { Barra } from "@/app/_components/barra";
import { Buscador } from "@/app/clientes/_components/buscador";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { fullName, getClient, searchClients } from "@/lib/data/clients";
import { listServices } from "@/lib/data/services";
import { formatPhone } from "@/lib/phone";
import { todayIn } from "@/lib/tz";
import { FormTurno } from "../_components/form-turno";

export const metadata: Metadata = { title: "Agendar turno" };

export default async function NuevoTurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; cliente?: string; q?: string }>;
}) {
  const { dia, cliente, q = "" } = await searchParams;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const tz = membership.tenant.timezone;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dia ?? "") ? dia! : todayIn(tz);

  // Paso 2: ya sabemos para quién es.
  if (cliente) {
    const [client, services] = await Promise.all([
      getClient(cliente),
      listServices(),
    ]);

    if (client) {
      const activos = services.filter((s) => s.is_active);

      return (
        <>
          <Barra tenantName={membership.tenant.name} />
          <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
              Agendar turno
            </h1>

            {activos.length === 0 ? (
              <Card>
                <CardBody className="grid justify-items-start gap-3">
                  <CardTitle>Primero cargá un servicio</CardTitle>
                  <p className="text-[14.5px] text-muted">
                    Un turno necesita saber qué se hace y cuánto dura. Sin
                    servicios activos no se puede agendar.
                  </p>
                  <Button asChild>
                    <Link href="/servicios/nuevo">Cargar un servicio</Link>
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <FormTurno
                clientId={client.id}
                clientName={fullName(client)}
                services={activos}
                date={date}
              />
            )}
          </main>
        </>
      );
    }
  }

  // Paso 1: elegir a quién.
  const { clients, total } = await searchClients({ query: q, page: 1 });

  return (
    <>
      <Barra tenantName={membership.tenant.name} />
      <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">
            ¿Para quién es el turno?
          </h1>
          <p className="mt-1 text-[14.5px] text-muted">
            Buscá por nombre, teléfono o correo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Buscador initial={q} />
          <Button asChild variant="outline">
            <Link href="/clientes/nuevo">Nueva ficha</Link>
          </Button>
        </div>

        {clients.length === 0 ? (
          <p className="rounded-card border-[1.5px] border-line bg-surface px-5 py-8 text-center text-[14.5px] text-muted">
            {total === 0 && !q
              ? "Todavía no tenés clientes cargados."
              : `No encontramos a nadie con “${q}”.`}
          </p>
        ) : (
          <ul className="grid gap-2">
            {clients.slice(0, 12).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/agenda/nuevo?dia=${date}&cliente=${c.id}`}
                  className="flex items-center gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 py-3 hover:border-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">
                      {fullName(c)}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      {formatPhone(c.phone_e164) ?? c.email ?? "Sin contacto"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] text-accent-text">
                    Elegir
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
