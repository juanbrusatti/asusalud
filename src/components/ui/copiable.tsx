"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Un valor para copiar y pegar en otro lado.
 *
 * Existe porque el alta de Meta termina en dos valores que hay que llevar de
 * una pantalla a la otra, y escribirlos a mano es exactamente donde se rompe:
 * un carácter de más y Meta rechaza el enlace sin decir por qué.
 */
export function Copiable({
  label,
  valor,
  hint,
}: {
  label: string;
  valor: string;
  hint?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-[12px] border-[1.5px] border-line bg-surface-2 px-3 py-2 text-[12.5px] whitespace-nowrap">
          {valor}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard
              .writeText(valor)
              .then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              })
              // Si el navegador no deja copiar, el valor igual está a la
              // vista: se puede seleccionar a mano.
              .catch(() => {});
          }}
        >
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>

      {hint && (
        <p className="text-[12.5px] leading-snug text-muted">{hint}</p>
      )}
    </div>
  );
}
