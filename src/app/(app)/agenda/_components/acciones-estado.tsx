"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  rescheduleAppointment,
  setAppointmentStatus,
  type FormState,
} from "@/lib/actions/agenda";
import type { AppointmentStatus } from "@/lib/data/agenda";

/**
 * Las acciones que se usan todos los días, en un toque.
 *
 * Marcar quién vino y quién no es lo que alimenta el índice de ausentismo, y
 * de ahí sale después cuántos recordatorios necesita cada cliente. Si cuesta
 * hacerlo, nadie lo hace y el dato no existe.
 *
 * Mover está siempre, sin importar el estado. Un turno confirmado es
 * justamente el que más se mueve —ya se habló con el cliente—, y esconder el
 * botón ahí obligaría a cancelar y volver a cargar, que pierde el historial.
 */

const INICIAL: FormState = { error: null };

function Mover() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Moviendo…" : "Mover el turno"}
    </Button>
  );
}

export function AccionesEstado({
  id,
  status,
  fecha,
  hora,
}: {
  id: string;
  status: AppointmentStatus;
  /** El día que tiene hoy, en la zona del negocio: `2026-09-18`. */
  fecha: string;
  /** La hora que tiene hoy: `14:30`. */
  hora: string;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelando, setCancelando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);
  const [motivo, setMotivo] = useState("");

  const [estadoMover, accionMover] = useActionState(
    rescheduleAppointment.bind(null, id),
    INICIAL,
  );

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

  if (moviendo) {
    return (
      <form action={accionMover} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor="mover-dia" className="text-[13.5px] font-medium">
              Nuevo día
            </label>
            <input
              id="mover-dia"
              name="date"
              type="date"
              required
              defaultValue={fecha}
              className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="mover-hora" className="text-[13.5px] font-medium">
              Nueva hora
            </label>
            <input
              id="mover-hora"
              name="time"
              type="time"
              // Cualquier minuto, no de a cinco. Un turno puede estar a las
              // 9:01 —lo movió el cliente, vino de una importación— y con el
              // salto de cinco el navegador rechaza su propia hora de origen.
              step={60}
              required
              defaultValue={hora}
              className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
            />
          </div>
        </div>

        <p className="text-[12.5px] leading-snug text-muted">
          Conserva los servicios y la duración. Si el horario nuevo ya está
          completo, te lo avisamos acá y no se mueve nada.
        </p>

        {estadoMover.error && (
          <p
            role="alert"
            className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
          >
            {estadoMover.error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Mover />
          <Button type="button" variant="ghost" onClick={() => setMoviendo(false)}>
            Volver
          </Button>
        </div>
      </form>
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

      <Button variant="outline" onClick={() => setMoviendo(true)}>
        Mover turno
      </Button>

      {(status === "pending" || status === "confirmed") && (
        <Button variant="danger" onClick={() => setCancelando(true)}>
          Cancelar turno
        </Button>
      )}
    </div>
  );
}
