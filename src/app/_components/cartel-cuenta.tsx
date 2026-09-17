"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bajarCartel } from "@/lib/actions/cuenta";
import { formatMes, type Cartel } from "@/lib/cuenta";
import { formatPrice } from "@/lib/money";

/**
 * El cartel que levanta Dlay cuando hay un mes sin pagar.
 *
 * Va en la pantalla de inicio y no en «Tu cuenta», que es justamente la
 * pantalla a la que no entra quien no está pensando en la factura.
 *
 * Se puede bajar. Un cartel que no se puede cerrar se deja de leer a los dos
 * días, y la deuda no se va a ningún lado: sigue en «Tu cuenta». Si Dlay
 * vuelve a recordar, el cartel vuelve a subir.
 */
export function CartelCuenta({ cartel }: { cartel: Cartel }) {
  const [bajando, empezar] = useTransition();

  return (
    <div className="grid gap-3 rounded-card border-[1.5px] border-warn bg-warn-wash p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[15.5px] font-semibold text-ink">
          Quedó pendiente la cuenta de{" "}
          {formatMes(cartel.periodo).toLowerCase()}
        </p>
        <p className="font-hand text-[26px] leading-none text-ink">
          {formatPrice(cartel.total_cents)}
        </p>
      </div>

      <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
        {cartel.veces > 1
          ? `Es el ${cartel.veces}° recordatorio. Entrá a tu cuenta para verla y pagarla.`
          : "Entrá a tu cuenta para ver el detalle y pagarla."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/configuracion/cuenta">Ver mi cuenta</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={bajando}
          onClick={() => empezar(() => void bajarCartel(cartel.periodo))}
        >
          {bajando ? "Cerrando…" : "Ya lo vi"}
        </Button>
      </div>
    </div>
  );
}
