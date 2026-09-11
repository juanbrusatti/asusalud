import { cn } from "@/lib/cn";

/**
 * Marca Dlay: trazo grueso y uniforme, dibujado a mano. Un único elemento va
 * en el índigo de acento y el resto queda en el color de la tinta.
 */
export function Logo({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="Dlay"
      className={cn("h-9 w-9", className)}
      fill="none"
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* La D, con la panza apenas irregular como un trazo de marcador. */}
      <path
        d="M11 6.5c0 9 .2 18 0 27 5.6.4 11.4.3 14.8-3.9 3.6-4.4 3.5-14.4-.4-18.6C22.1 6.9 16.4 6.2 11 6.5Z"
        stroke="var(--draw)"
      />
      <path d="M5.4 20.1c1.9-.2 3.8-.2 5.6 0" stroke="var(--draw)" />
      {/* El punto: el único elemento en color. */}
      <path d="M30.6 31.4a3 3 0 1 1 .1 0Z" fill="var(--accent)" stroke="var(--accent)" />
    </svg>
  );
}
