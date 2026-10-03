"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setTestMode } from "@/lib/actions/recordatorios";

/**
 * El modo de prueba.
 *
 * Todo negocio arranca acá: el sistema hace todo el recorrido —arma el
 * mensaje, elige el canal, lo anota— pero no sale nada hacia afuera. Sirve
 * para mirar una semana entera de recordatorios antes de que llegue uno solo a
 * un cliente de verdad.
 *
 * Salir es deliberado y pide confirmación, porque es el momento a partir del
 * cual una regla mal armada le escribe a miles de personas.
 */
export function ModoPrueba({
  testMode,
  puedeEditar,
}: {
  testMode: boolean;
  puedeEditar: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  if (!testMode) {
    return puedeEditar ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 py-3">
        <p className="text-[13.5px] text-muted">
          Los recordatorios se están enviando de verdad.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void setTestMode(true);
            })
          }
        >
          Volver al modo de prueba
        </Button>
      </div>
    ) : null;
  }

  return (
    <div className="rounded-card border-[1.5px] border-accent bg-accent px-5 py-4 text-on-accent">
      <p className="font-hand text-[34px] leading-none">Modo de prueba</p>
      <p className="mt-2 max-w-prose text-[14.5px] leading-relaxed opacity-90">
        Todo funciona como si fuera de verdad —se arma cada mensaje, se elige el
        canal, se anota en la bitácora— pero <strong>no sale nada</strong>.
        Ningún cliente recibe ni un aviso.
      </p>
      <p className="mt-2 max-w-prose text-[13px] leading-relaxed opacity-80">
        Dejalo así unos días y mirá qué se habría enviado. Cuando los mensajes
        digan lo que querés y le lleguen a quien corresponde, recién ahí
        activalo.
      </p>

      {puedeEditar && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirmando ? (
            <>
              <span className="text-[13.5px] font-semibold">
                A partir de ahora los mensajes llegan a personas reales.
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(() => {
                    void setTestMode(false);
                  })
                }
              >
                Sí, empezar a enviar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-on-accent hover:bg-white/15"
                onClick={() => setConfirmando(false)}
              >
                Mejor no
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmando(true)}
            >
              Empezar a enviar de verdad
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
