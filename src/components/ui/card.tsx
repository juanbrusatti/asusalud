import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Tarjeta de esquinas generosas: el contenedor base de toda la interfaz. */
export function Card({
  className,
  accent = false,
  ...props
}: ComponentProps<"div"> & { accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border-[1.5px]",
        accent
          ? "border-accent bg-accent text-on-accent"
          : "border-line bg-surface text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-6 sm:p-7", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "text-lg font-semibold tracking-[-0.02em] text-balance",
        className,
      )}
      {...props}
    />
  );
}

/** Dato clave con aire de etiqueta escrita a mano. */
export function CardFigure({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-hand text-[40px] leading-none tracking-normal",
        className,
      )}
      {...props}
    />
  );
}
