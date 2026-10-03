"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { leerGuardado, escribirGuardado, useHidratado } from "@/lib/navegador";
import {
  LLAVE_SONIDOS,
  sonarCancelado,
  sonarConfirmado,
} from "@/lib/sonidos";
import { createClient } from "@/lib/supabase/client";

/**
 * La agenda se entera sola de lo que hacen las clientas.
 *
 * Una clienta toca «Confirmar» en WhatsApp y el turno cambia en la base. Hasta
 * acá, en la pantalla no pasaba nada hasta que alguien recargara.
 *
 * Escucha las altas de `appointment_status_history`: cada fila es un cambio de
 * estado y ya viene con `by_client`, así que se distingue lo que llegó solo de
 * lo que acaba de hacer la dueña con el mouse. La lista se refresca con
 * cualquiera de los dos; el sonido, sólo con el primero. Que suene en la cara
 * de quien apretó el botón no avisa nada: molesta.
 *
 * El filtro por estética va en la suscripción, pero no es lo que protege: la
 * política de RLS de la tabla ya limita las filas a las estéticas de quien
 * está mirando, y Realtime la respeta.
 */

type Cambio = { to_status: string; by_client: boolean };

export function EnVivo({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const hidratado = useHidratado();

  // Se deriva en lugar de sincronizarse con un efecto: el servidor no ve el
  // almacenamiento, así que el primer dibujo sale apagado y recién después se
  // lee lo guardado. Encender es la opción de fábrica.
  const [elegido, setElegido] = useState<boolean | null>(null);
  const guardado = hidratado
    ? leerGuardado<{ activo: boolean }>(LLAVE_SONIDOS).activo !== false
    : false;
  const activo = elegido ?? guardado;

  // El oyente se suscribe una sola vez. Sin esta copia habría que volver a
  // suscribirse cada vez que se toca el interruptor.
  const activoRef = useRef(activo);
  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);

  useEffect(() => {
    const supabase = createClient();

    const canal = supabase
      .channel(`agenda:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointment_status_history",
          filter: `tenant_id=eq.${tenantId}`,
        },
        ({ new: fila }: { new: Cambio }) => {
          // Primero la pantalla, que es lo que importa; el sonido acompaña.
          router.refresh();

          if (!fila.by_client || !activoRef.current) return;
          if (fila.to_status === "confirmed") sonarConfirmado();
          else if (fila.to_status === "cancelled") sonarCancelado();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [tenantId, router]);

  return (
    <button
      type="button"
      onClick={() => {
        const nuevo = !activo;
        setElegido(nuevo);
        escribirGuardado(LLAVE_SONIDOS, { activo: nuevo });
        // Que se escuche lo que se acaba de encender, y de paso el navegador
        // despierta el audio con este mismo toque.
        if (nuevo) sonarConfirmado();
      }}
      aria-pressed={activo}
      title={
        activo
          ? "Suena cuando un cliente confirma o cancela desde WhatsApp"
          : "Sin sonido cuando un cliente confirma o cancela"
      }
      className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px]
        border-line px-2.5 py-1 text-[12.5px] text-muted hover:text-ink"
    >
      <span aria-hidden>{activo ? "🔔" : "🔕"}</span>
      {activo ? "Con sonido" : "Sin sonido"}
    </button>
  );
}
