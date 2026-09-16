"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setSendingEnabled } from "@/lib/actions/recordatorios";

/**
 * El freno general. Para todo sin tocar ninguna regla.
 *
 * Existe porque cuando algo sale mal hay que poder detenerlo en un toque, no
 * apagando reglas de a una. Mientras está frenado tampoco se planifica: si la
 * cola se siguiera llenando, al soltar el freno saldría todo junto de golpe,
 * que es justo lo que provoca un bloqueo.
 */
export function Freno({
  enabled,
  reason,
}: {
  enabled: boolean;
  reason: string | null;
}) {
  const [pending, startTransition] = useTransition();

  if (enabled) {
    return (
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void setSendingEnabled(false);
          })
        }
      >
        Frenar todos los envíos
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border-[1.5px] border-warn bg-warn-wash px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-warn">
          Envíos frenados
        </p>
        <p className="text-[13.5px] text-ink">
          {reason ?? "No sale ningún mensaje automático."} Mientras tanto
          tampoco se planifican nuevos, así que al reanudar no va a salir todo
          junto.
        </p>
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void setSendingEnabled(true);
          })
        }
      >
        Reanudar
      </Button>
    </div>
  );
}
