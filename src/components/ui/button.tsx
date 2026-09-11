import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "solid" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // El acento sólo se usa así: bloque lleno, nunca degradado.
  solid: "bg-accent text-on-accent hover:opacity-90 active:opacity-80",
  outline: "border-[1.5px] border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink",
  danger: "border-[1.5px] border-line bg-surface text-danger hover:bg-danger-wash",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  // 44px: el mínimo cómodo para un pulgar. La mayoría del equipo trabaja
  // desde el teléfono con las manos ocupadas.
  md: "h-11 px-5 text-[14.5px] gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
};

export function Button({
  className,
  variant = "solid",
  size = "md",
  asChild = false,
  ...props
}: ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center rounded-pill font-medium",
        "transition-opacity disabled:pointer-events-none disabled:opacity-50",
        "whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
