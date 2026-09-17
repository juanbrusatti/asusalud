"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { generarPago, type PagoState } from "@/lib/actions/pago";

/**
 * Pagar un mes desde adentro del sistema.
 *
 * Se muestran las dos formas a propósito. El QR sirve cuando el negocio está
 * en la computadora y quiere pagar con el teléfono; el botón sirve cuando ya
 * está en el teléfono, que es donde un QR no sirve para nada.
 *
 * La imagen es un `img` con una imagen embebida, no un `next/image`: el QR se
 * arma en el momento y no hay nada que optimizar ni que cachear.
 */
export function Pagar({ periodo }: { periodo: string }) {
  const [pendiente, empezar] = useTransition();
  const [estado, setEstado] = useState<PagoState | null>(null);

  if (estado?.url) {
    return (
      <div className="grid w-full basis-full gap-3 rounded-card border-[1.5px] border-line bg-surface-2 p-4">
        {estado.qr && (
          <img
            src={estado.qr}
            alt="Código QR para pagar en Mercado Pago"
            className="mx-auto size-40 rounded-[12px] bg-white p-1.5"
            width={160}
            height={160}
          />
        )}

        <p className="text-center text-[13px] leading-relaxed text-muted">
          Escaneá el código con el teléfono, o tocá el botón si ya estás en él.
        </p>

        <div className="flex justify-center">
          <Button asChild size="sm">
            <a href={estado.url} target="_blank" rel="noopener noreferrer">
              Pagar en Mercado Pago ↗
            </a>
          </Button>
        </div>

        <p className="text-center text-[12px] leading-relaxed text-faint">
          Después de pagar puede tardar un rato en figurar como pagado acá.
        </p>
      </div>
    );
  }

  // Van sueltos y no envueltos en un contenedor: la fila del mes es un flex
  // que envuelve, y así el error baja a su propio renglón en lugar de
  // ensanchar esta columna y aplastar el nombre del mes.
  //
  // `basis-full` y no sólo `w-full`: un ancho del 100% en un flex se encoge
  // igual si falta lugar, y entonces no baja de renglón, se apretuja.
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            setEstado(await generarPago(periodo));
          })
        }
      >
        {pendiente ? "Preparando…" : "Pagar"}
      </Button>

      {estado?.error && (
        <p
          role="alert"
          className="w-full basis-full text-[12.5px] leading-snug text-danger"
        >
          {estado.error}
        </p>
      )}
    </>
  );
}
