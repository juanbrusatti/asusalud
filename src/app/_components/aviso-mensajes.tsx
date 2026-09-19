"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { leerGuardado, useHidratado } from "@/lib/navegador";
import { LLAVE_SONIDOS, sonarMensaje } from "@/lib/sonidos";
import { createClient } from "@/lib/supabase/client";
import { NavLink } from "./nav-link";

/**
 * El enlace a Mensajes, con cuántos quedaron sin ver.
 *
 * Vive en la barra y no en la pantalla de mensajes a propósito: lo que hace
 * falta es enterarse SIN estar ahí. Por eso también suena acá, y suena en
 * cualquier pantalla del sistema.
 *
 * El número se muestra siempre, incluso en cero. Una burbuja que aparece y
 * desaparece obliga a mirar dos veces para saber si no hay mensajes o si el
 * contador se rompió; un cero dice las dos cosas de una.
 */
export function AvisoMensajes({
  tenantId,
  sinVer,
}: {
  tenantId: string;
  sinVer: number;
}) {
  const router = useRouter();
  const hidratado = useHidratado();

  const activo = hidratado
    ? leerGuardado<{ activo: boolean }>(LLAVE_SONIDOS).activo !== false
    : false;

  const activoRef = useRef(activo);
  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);

  useEffect(() => {
    const supabase = createClient();

    const canal = supabase
      .channel(`mensajes:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_inbound",
          filter: `tenant_id=eq.${tenantId}`,
        },
        ({ new: fila }: { new: { payload: string | null } }) => {
          // Que alguien apriete «Confirmar» ya lo canta la agenda con su
          // propio sonido. Sonar dos veces por el mismo hecho es ruido.
          if (fila.payload) return;

          router.refresh();
          if (activoRef.current) sonarMensaje();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [tenantId, router]);

  return (
    <NavLink href="/mensajes">
      <span className="inline-flex items-center gap-1.5">
        Mensajes
        <span
          aria-label={`${sinVer} sin ver`}
          className={`inline-flex h-[18px] min-w-[18px] items-center justify-center
            rounded-pill px-1 text-[11px] font-semibold tabular-nums ${
              sinVer > 0
                ? "bg-warn text-on-accent"
                : "bg-surface-2 text-faint"
            }`}
        >
          {sinVer}
        </span>
      </span>
    </NavLink>
  );
}
