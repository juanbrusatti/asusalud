import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { getCurrentTenant } from "@/lib/auth/tenant";
import { getClientAgenda } from "@/lib/data/agenda";
import {
  countPhoneDuplicates,
  fullName,
  getClient,
  listNotes,
  listTagIdsFor,
  listTags,
} from "@/lib/data/clients";
import { formatPrice } from "@/lib/money";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { longDateIn, timeIn } from "@/lib/tz";
import { SelectorCanal } from "../_components/canal";
import { Etiquetas } from "../_components/etiquetas";
import { Notas } from "../_components/notas";

export const metadata: Metadata = { title: "Ficha" };

const fechaCorta = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "long",
});

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </dt>
      <dd className="text-[14.5px]">{children}</dd>
    </div>
  );
}

export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const client = await getClient(id);
  if (!client) notFound();

  const [notes, tags, assigned, duplicados, agenda] = await Promise.all([
    listNotes(id),
    listTags(),
    listTagIdsFor(id),
    countPhoneDuplicates(id),
    getClientAgenda(id),
  ]);

  const tz = membership.tenant.timezone;
  const diaDe = (instante: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(instante));

  const wa = whatsappLink(client.phone_e164);

  return (
    <>

      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/clientes"
              className="text-[13px] text-muted hover:text-ink"
            >
              ← Clientes
            </Link>
            <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
              {fullName(client)}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {wa && (
              <Button asChild variant="outline">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  Abrir chat
                </a>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/clientes/${id}/editar`}>Editar</Link>
            </Button>
            <Button asChild>
              <Link href={`/agenda/nuevo?cliente=${id}`}>Agendar turno</Link>
            </Button>
          </div>
        </div>

        {/* Lo que no se puede pasar por alto va primero y en color. */}
        {client.alert && (
          <div className="rounded-card border-[1.5px] border-warn bg-warn-wash px-4 py-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-warn">
              Atención
            </p>
            <p className="mt-0.5 text-[14.5px] leading-relaxed text-ink">
              {client.alert}
            </p>
          </div>
        )}

        <Card>
          <CardBody className="grid gap-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Dato label="Teléfono">
                {formatPhone(client.phone_e164) ?? client.phone_raw ?? "—"}
                {duplicados > 0 && (
                  <span className="ml-2 rounded-pill bg-warn-wash px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                    {duplicados === 1
                      ? "Otra ficha usa este número"
                      : `${duplicados} fichas más usan este número`}
                  </span>
                )}
              </Dato>
              <Dato label="Correo">{client.email ?? "—"}</Dato>
              <Dato label="Documento">{client.document_id ?? "—"}</Dato>
              <Dato label="Cumpleaños">
                {client.birthdate
                  ? fechaCorta.format(new Date(`${client.birthdate}T12:00:00`))
                  : "—"}
              </Dato>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>Turnos</CardTitle>

            <dl className="grid gap-4 sm:grid-cols-2">
              <Dato label="Próximo turno">
                {agenda.next ? (
                  <Link
                    href={`/agenda/${agenda.next.id}`}
                    className="capitalize text-accent-text hover:underline"
                  >
                    {longDateIn(diaDe(agenda.next.starts_at), tz)} ·{" "}
                    {timeIn(agenda.next.starts_at, tz)}
                  </Link>
                ) : (
                  "Sin turnos a futuro"
                )}
              </Dato>

              <Dato label="Última vez">
                {agenda.last ? (
                  <Link
                    href={`/agenda/${agenda.last.id}`}
                    className="capitalize text-accent-text hover:underline"
                  >
                    {longDateIn(diaDe(agenda.last.starts_at), tz)}
                  </Link>
                ) : (
                  "Nunca vino"
                )}
              </Dato>

              <Dato label="Atendidos">{agenda.attended}</Dato>

              <Dato label="No vino">
                <span className={agenda.noShows > 0 ? "text-warn" : undefined}>
                  {agenda.noShows}
                </span>
              </Dato>
            </dl>

            {agenda.noShows > 0 && (
              <p className="text-[12.5px] leading-snug text-muted">
                Con faltas registradas conviene mandarle el recordatorio de 24
                horas por WhatsApp, aunque el resto le llegue por correo.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>Recordatorios</CardTitle>
            <SelectorCanal
              clientId={id}
              mode={client.channel_mode}
              hasEmail={Boolean(client.email)}
              hasPhone={Boolean(client.phone_e164)}
            />
          </CardBody>
        </Card>

        {client.legacy_visits_count !== null && (
          <Card>
            <CardBody className="grid gap-3">
              <CardTitle>Historial anterior</CardTitle>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Dato label="Turnos">{client.legacy_visits_count}</Dato>
                <Dato label="Total gastado">
                  {client.legacy_total_cents !== null
                    ? formatPrice(client.legacy_total_cents)
                    : "—"}
                </Dato>
                <Dato label="Última visita">
                  {client.legacy_last_visit_on
                    ? new Intl.DateTimeFormat("es-AR").format(
                        new Date(`${client.legacy_last_visit_on}T12:00:00`),
                      )
                    : "—"}
                </Dato>
              </dl>
              <p className="text-[12.5px] leading-snug text-muted">
                Son los datos que trajimos de{" "}
                {client.legacy_source ?? "tu sistema anterior"}. No se
                actualizan: los turnos nuevos se cuentan aparte.
              </p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>Etiquetas</CardTitle>
            <Etiquetas clientId={id} tags={tags} assigned={assigned} />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>Seguimiento</CardTitle>
            <Notas clientId={id} notes={notes} />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
