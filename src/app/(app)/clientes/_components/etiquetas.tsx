"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  createTagAction,
  toggleTagAction,
  type FormState,
} from "@/lib/actions/clients";
import type { ClientTag } from "@/lib/data/clients";

const INITIAL: FormState = { error: null };

export function Etiquetas({
  clientId,
  tags,
  assigned,
}: {
  clientId: string;
  tags: ClientTag[];
  assigned: string[];
}) {
  const [pending, startTransition] = useTransition();
  const action = createTagAction.bind(null, clientId);
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <div className="grid gap-3">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const activa = assigned.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={pending}
                aria-pressed={activa}
                onClick={() =>
                  startTransition(() => {
                    void toggleTagAction(clientId, t.id, !activa);
                  })
                }
                className={`rounded-pill border-[1.5px] px-3 py-1 text-[12.5px] font-medium disabled:opacity-50 ${
                  activa
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      )}

      <form action={formAction} className="flex gap-2">
        <input
          name="name"
          maxLength={40}
          placeholder="Nueva etiqueta…"
          aria-label="Nombre de la etiqueta nueva"
          className="h-9 flex-1 rounded-pill border-[1.5px] border-line bg-surface px-3.5 text-[13.5px] text-ink placeholder:text-faint"
        />
        <Button type="submit" variant="outline" size="sm">
          Crear
        </Button>
      </form>

      {state.error && (
        <p role="alert" className="text-[12.5px] text-danger">
          {state.error}
        </p>
      )}

      <p className="text-[12.5px] leading-snug text-muted">
        Las etiquetas sirven para agrupar gente y después decidir a quién le
        llega cada recordatorio o cada promoción.
      </p>
    </div>
  );
}
