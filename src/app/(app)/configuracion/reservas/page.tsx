import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getBookingSettings, getBusinessHours, getTenant } from "@/lib/data/configuracion";
import { publicEnv } from "@/lib/env";
import { Volver } from "../_components/volver";
import { FormReservas } from "./form";

export const metadata: Metadata = { title: "Reserva online" };

export default async function ReservasPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "admin")) notFound();

  const [settings, tenant, horarios] = await Promise.all([
    getBookingSettings(),
    getTenant(),
    getBusinessHours(),
  ]);

  if (!settings || !tenant) notFound();

  return (
    <>
      <main className="mx-auto grid max-w-xl gap-5 px-4 py-8">
        <div>
          <Volver />
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
            Reserva online
          </h1>
          <p className="mt-1 max-w-prose text-[14.5px] text-muted">
            Tus clientes sacan turno por su cuenta, a cualquier hora, sin que tengas que
            contestar nada.
          </p>
        </div>

        {horarios.length === 0 && (
          <div className="rounded-card border-[1.5px] border-warn bg-warn-wash px-4 py-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-warn">
              Falta un paso
            </p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink">
              Todavía no cargaste tus horarios de atención, así que aunque
              abras la agenda no se va a ofrecer ningún horario.
            </p>
          </div>
        )}

        <FormReservas
          settings={settings}
          link={`${publicEnv.NEXT_PUBLIC_SITE_URL}/r/${tenant.slug}`}
        />
      </main>
    </>
  );
}
