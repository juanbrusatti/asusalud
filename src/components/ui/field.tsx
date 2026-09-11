import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Campo con etiqueta, ayuda y error. La ayuda va siempre visible en lugar de
 * escondida en un tooltip: quien entra por primera vez tiene que entender el
 * formulario sin que nadie se lo explique.
 */
export function Field({
  label,
  hint,
  error,
  className,
  ...props
}: Omit<ComponentProps<"input">, "id"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-medium text-ink">
        {label}
      </label>

      <input
        id={id}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-11 w-full rounded-[14px] border-[1.5px] bg-surface px-3.5",
          "text-[15px] text-ink placeholder:text-faint",
          error ? "border-danger" : "border-line",
          className,
        )}
        {...props}
      />

      {hint && !error && (
        <p id={hintId} className="text-[12.5px] leading-snug text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
