"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * La cuenta suspendida tapa todo menos el lugar donde se paga.
 *
 * Los datos siguen ahí —no se borró nada— y los recordatorios, la reserva
 * online y los enlaces de autogestión están frenados en la base, que es donde
 * importa. Esto es lo que lo dice, y deja la puerta de «Tu cuenta» abierta:
 * un muro sin salida no cobra, enoja.
 */
export function MuroSuspension({
  activo,
  puedePagar,
  hasta,
  children,
}: {
  activo: boolean;
  puedePagar: boolean;
  hasta: string;
  children: ReactNode;
}) {
  const ruta = usePathname();
  if (!activo || ruta.startsWith("/configuracion/cuenta")) return <>{children}</>;

  return (
    <main className="mx-auto grid max-w-xl gap-5 px-4 py-14">
      <div className="grid gap-3 rounded-card border-[1.5px] border-warn bg-warn-wash p-6">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-warn">
          Cuenta suspendida
        </p>
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.03em] text-ink">
          El abono venció el {hasta} y no se pagó.
        </h1>
        <p className="text-[14.5px] leading-relaxed text-ink">
          No se borró nada: tus clientas, tus turnos y tu configuración están
          intactos. Mientras tanto están frenados los recordatorios, la reserva
          online y los enlaces para que tus clientas cambien su turno.
        </p>
        <p className="text-[14.5px] leading-relaxed text-ink">
          {puedePagar
            ? "En cuanto pagues, todo vuelve a funcionar tal como estaba."
            : "Avisale a la dueña del negocio: en cuanto pague, todo vuelve a funcionar tal como estaba."}
        </p>
        {puedePagar && (
          <div>
            <Link
              href="/configuracion/cuenta"
              className="inline-flex rounded-[14px] bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-on-accent hover:opacity-90"
            >
              Pagar y reactivar
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
