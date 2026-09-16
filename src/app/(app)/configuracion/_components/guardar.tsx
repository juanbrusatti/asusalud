"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/actions/configuracion";

export function Guardar({ label = "Guardar cambios" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Guardando…" : label}
    </Button>
  );
}

/** Un solo lugar para el error y el aviso de guardado. */
export function Resultado({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-[14px] bg-danger-wash px-4 py-3 text-[13.5px] text-danger"
      >
        {state.error}
      </p>
    );
  }

  if (state.notice) {
    return (
      <p className="rounded-[14px] bg-accent-wash px-4 py-3 text-[13.5px] text-accent-text">
        {state.notice}
      </p>
    );
  }

  return null;
}
