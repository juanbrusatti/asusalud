import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export function Select({
  label,
  hint,
  className,
  children,
  ...props
}: Omit<ComponentProps<"select">, "id"> & {
  label: string;
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          "h-11 w-full appearance-none rounded-[14px] border-[1.5px] border-line",
          "bg-surface px-3.5 text-[15px] text-ink",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {hint && (
        <p id={hintId} className="text-[12.5px] leading-snug text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
