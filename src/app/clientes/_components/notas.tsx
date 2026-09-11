"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { addNoteAction, type FormState } from "@/lib/actions/clients";
import type { ClientNote } from "@/lib/data/clients";

const INITIAL: FormState = { error: null };

const fecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando…" : "Agregar nota"}
    </Button>
  );
}

export function Notas({
  clientId,
  notes,
}: {
  clientId: string;
  notes: ClientNote[];
}) {
  const action = addNoteAction.bind(null, clientId);
  const [state, formAction] = useActionState(action, INITIAL);
  const ref = useRef<HTMLFormElement>(null);

  // Tras guardar, el campo queda limpio y listo para la siguiente nota.
  useEffect(() => {
    if (state.notice) ref.current?.reset();
  }, [state.notice]);

  return (
    <div className="grid gap-4">
      <form ref={ref} action={formAction} className="grid gap-2">
        <textarea
          name="body"
          rows={3}
          maxLength={2000}
          required
          placeholder="Cómo respondió la piel, qué producto se usó, qué quedó pendiente para la próxima…"
          className="w-full rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint"
        />
        <div className="flex items-center gap-3">
          <Submit />
          {state.error && (
            <p role="alert" className="text-[13px] text-danger">
              {state.error}
            </p>
          )}
          {state.notice && !state.error && (
            <p className="text-[13px] text-muted">{state.notice}</p>
          )}
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-[13.5px] leading-relaxed text-muted">
          Todavía no hay notas. Las notas se suman y no se editan: son el
          registro de lo que fue pasando sesión a sesión.
        </p>
      ) : (
        <ol className="grid gap-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="border-l-[2.5px] border-line pl-3.5 text-[14px]"
            >
              <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
              <p className="mt-1 text-[12px] text-faint">
                {n.author?.full_name ?? "Alguien del equipo"} ·{" "}
                {fecha.format(new Date(n.created_at))}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
