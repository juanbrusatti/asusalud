"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setAppointmentStatus } from "@/lib/actions/agenda";
import type { AppointmentStatus } from "@/lib/data/agenda";

/**
 * Las acciones que se usan todos los días, en un toque.
 *
 * Marcar quién vino y quién no es lo que alimenta el índice de ausentismo, y
 * de ahí sale después cuántos recordatorios necesita cada cliente. Si cuesta
 * hacerlo, nadie lo hace y el dato no existe.
 */
export function AccionesEstado({
  id,
  status,
}: {
  id: string;
  status: AppointmentStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const cambiar = (next: AppointmentStatus, reason?: string) =>
    startTransition(() => {
      void setAppointmentStatus(id, next, reason);
    });

  if (cancelando) {
    return (
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor="motivo" className="text-[13.5px] font-medium">
            ¿Por qué se cancela?
          </label>
          <input
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Avisó que no puede venir"
            className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
          />
          <p className="text-[12.5px] text-muted">
            Queda registrado junto con la cancelación. Ayuda a entender después
            por qué se perdieron turnos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => cambiar("cancelled", motivo.trim() || undefined)}
          >
            Confirmar cancelación
          </Button>
          <Button variant="ghost" onClick={() => setCancelando(false)}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending" && (
        <Button disabled={pending} onClick={() => cambiar("confirmed")}>
          Confirmar
        </Button>
      )}

      {(status === "pending" || status === "confirmed") && (
        <>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => cambiar("attended")}
          >
            Vino y se atendió
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => cambiar("no_show")}
          >
            No vino
          </Button>
          <Button variant="danger" onClick={() => setCancelando(true)}>
            Cancelar turno
          </Button>
        </>
      )}

      {(status === "attended" || status === "no_show" || status === "cancelled") && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => cambiar("confirmed")}
        >
          Volver a confirmado
        </Button>
      )}
    </div>
  );
}
