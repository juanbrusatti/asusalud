"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteTemplate } from "@/lib/actions/recordatorios";

/**
 * Borrar un mensaje.
 *
 * En dos pasos: el primer toque pregunta, el segundo borra. Un botón que borra
 * de una, al lado de «Guardar cambios», es un accidente esperando.
 *
 * Si alguna regla lo usa, no se borra y se dice cuál: la regla se quedaría sin
 * qué mandar por ese canal, y eso no se descubre hasta que alguien no recibe
 * su recordatorio.
 */
export function BorrarPlantilla({ id }: { id: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, empezar] = useTransition();

  if (!confirmando) {
    return (
      <div className="grid gap-2">
        {error && (
          <p
            role="alert"
            className="rounded-[14px] bg-danger-wash px-4 py-3 text-[13.5px] text-danger"
          >
            {error}
          </p>
        )}
        <div className="flex">
          <Button
            type="button"
            variant="danger"
            size="lg"
            onClick={() => {
              setError(null);
              setConfirmando(true);
            }}
          >
            Borrar mensaje
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-3 rounded-card border-[1.5px] border-line bg-surface-2 px-4 py-3.5">
      <p className="max-w-prose text-[13.5px] leading-relaxed">
        ¿Borrar este mensaje? Lo que ya se envió no se toca: cada envío guarda
        el texto que salió, así que la bitácora sigue completa.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="danger"
          disabled={borrando}
          onClick={() =>
            empezar(async () => {
              const r = await deleteTemplate(id);
              if (r?.error) {
                setError(r.error);
                setConfirmando(false);
              }
            })
          }
        >
          {borrando ? "Borrando…" : "Sí, borrarlo"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmando(false)}
        >
          Volver
        </Button>
      </div>
    </div>
  );
}
