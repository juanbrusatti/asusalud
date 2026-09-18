import { cn } from "@/lib/cn";

/**
 * Marca Dlay: una D blanca sobre la teja índigo.
 *
 * La anterior era un trazo dibujado a mano, que se leía bien en grande y se
 * volvía una mancha a 22 píxeles, que es el tamaño al que se ve casi siempre.
 * Esta es geométrica y va sobre fondo propio, así que se lee igual sobre el
 * hueso, sobre el negro y sobre la pantalla de inicio de un teléfono, donde
 * compite con los íconos de todas las demás aplicaciones.
 *
 * Los colores van fijos y no por variables: la teja es la marca, y una marca
 * que cambia de color con el tema deja de ser una marca.
 */
export function Logo({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="Dlay"
      className={cn("h-9 w-9", className)}
      {...props}
    >
      <rect width="40" height="40" rx="10" fill="#3e3fe0" />
      <path
        d="M13.3 11v18M13.3 11h4.5a9 9 0 0 1 0 18h-4.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
