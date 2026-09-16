import { cn } from "@/lib/cn";

/**
 * El hueco que ocupa algo mientras carga.
 *
 * No intenta adivinar el contenido real: dibuja la forma de la pantalla —un
 * título, unas tarjetas— para que el ojo tenga dónde apoyarse y para que no
 * salte todo cuando llega lo de verdad.
 */
export function Bloque({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[10px] bg-surface-2",
        // Quien pidió menos movimiento no ve el latido.
        "animate-pulse motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** Una tarjeta vacía, del tamaño de las que van a aparecer. */
export function TarjetaVacia({ lineas = 3 }: { lineas?: number }) {
  return (
    <div className="grid gap-3 rounded-card border-[1.5px] border-line bg-surface p-6 sm:p-7">
      <Bloque className="h-4 w-40" />
      {Array.from({ length: lineas }).map((_, i) => (
        <Bloque
          key={i}
          className={cn("h-3.5", i === lineas - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * La pantalla mientras llega.
 *
 * Aparece al instante al navegar, así el clic tiene respuesta inmediata aunque
 * el servidor tarde. Antes de esto, la pantalla anterior se quedaba congelada
 * sin ninguna señal de que algo estuviera pasando.
 */
export function PantallaCargando({ tarjetas = 3 }: { tarjetas?: number }) {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando"
      className="mx-auto grid max-w-3xl gap-5 px-4 py-8"
    >
      <div className="grid gap-2">
        <Bloque className="h-7 w-48" />
        <Bloque className="h-4 w-72 max-w-full" />
      </div>

      {Array.from({ length: tarjetas }).map((_, i) => (
        <TarjetaVacia key={i} lineas={i === 0 ? 4 : 2} />
      ))}
    </main>
  );
}
