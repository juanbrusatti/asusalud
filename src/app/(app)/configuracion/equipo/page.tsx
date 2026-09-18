import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getEquipo, getInvitaciones } from "@/lib/data/equipo";
import { publicEnv } from "@/lib/env";
import { Volver } from "../_components/volver";
import { PanelEquipo } from "./panel";

export const metadata: Metadata = { title: "Tu equipo" };

/**
 * Quién más entra al sistema.
 *
 * Los cuatro roles existían desde el primer día —la base los respeta en todas
 * las tablas— y no había forma de dar de alta a una segunda persona. Sin esta
 * pantalla, un negocio con tres empleadas comparte una sola cuenta y el
 * registro de quién hizo qué no sirve para nada.
 */
export default async function EquipoPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const [equipo, invitaciones] = await Promise.all([
    getEquipo(),
    getInvitaciones(),
  ]);

  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
      <div>
        <Volver />
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Tu equipo
        </h1>
        <p className="mt-1 max-w-prose text-[14.5px] text-muted">
          Cada persona entra con su propia cuenta. Así la agenda dice quién
          atendió, las notas dicen quién las escribió, y cada una ve sólo lo
          que le toca.
        </p>
      </div>

      <PanelEquipo
        equipo={equipo}
        invitaciones={invitaciones}
        sitio={publicEnv.NEXT_PUBLIC_SITE_URL}
      />

      <Card>
        <CardBody className="grid gap-3">
          <CardTitle>Qué ve cada rol</CardTitle>
          <dl className="grid gap-2.5 text-[13.5px] leading-relaxed">
            {[
              ["Titular", "Todo, incluida la cuenta de Dlay. Es quien creó el negocio y no se puede sacar."],
              ["Administración", "Todo menos dar de baja el negocio."],
              ["Recepción", "Agenda, clientes y caja. No toca precios ni configuración."],
              ["Profesional", "Su agenda y las fichas. No ve la caja ni la cuenta."],
            ].map(([rol, que]) => (
              <div key={rol}>
                <dt className="font-medium text-ink">{rol}</dt>
                <dd className="text-muted">{que}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </main>
  );
}
