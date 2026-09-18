"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Después de guardar bien, volver a leer del servidor.
 *
 * `revalidatePath` marca la pantalla como vencida para la próxima navegación,
 * pero el árbol que ya está dibujado sigue con los datos del momento en que se
 * cargó la página. En un campo de texto no se nota, porque el navegador
 * conserva lo que la persona escribió; en un interruptor sí, porque lo dibuja
 * React y vuelve al valor viejo.
 *
 * Esto pide el dibujo nuevo, así lo que queda en pantalla es lo que quedó
 * guardado. Si alguna vez no coinciden, se ve acá y no tres días después.
 */
export function useRefrescarAlGuardar(aviso?: string | null) {
  const router = useRouter();
  const anterior = useRef(aviso);

  useEffect(() => {
    // Sólo cuando aparece un aviso nuevo: sin esto se refrescaría en cada
    // dibujo y la pantalla no pararía nunca.
    if (aviso && aviso !== anterior.current) router.refresh();
    anterior.current = aviso;
  }, [aviso, router]);
}
