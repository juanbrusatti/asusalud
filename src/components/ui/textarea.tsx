import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

export function Textarea({
  label,
  hint,
  className,
  ...props
}: Omit<ComponentProps<"textarea">, "id"> & {
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
      <textarea
        id={id}
        aria-describedby={hint ? hintId : undefined}
        className={cn(
          "min-h-20 w-full rounded-[14px] border-[1.5px] border-line bg-surface",
          "px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint",
          className,
        )}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-[12.5px] leading-snug text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
