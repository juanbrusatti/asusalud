"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

/**
 * Interruptor con su explicación al lado. En un negocio nadie va a pasar el
 * mouse por encima esperando un tooltip: la consecuencia de encenderlo o
 * apagarlo se lee directamente.
 */
export function Toggle({
  name,
  label,
  hint,
  defaultChecked = false,
  onChange,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const id = useId();
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          onChange?.(e.target.checked);
        }}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={`mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center
          rounded-pill border-[1.5px] p-0.5 transition-colors
          peer-focus-visible:outline peer-focus-visible:outline-2
          peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent
          ${checked ? "border-accent bg-accent" : "border-line bg-surface-2"}`}
      >
        <span
          className={`h-4 w-4 rounded-full transition-transform
            ${checked ? "translate-x-5 bg-on-accent" : "translate-x-0 bg-faint"}`}
        />
      </label>

      <div className="grid gap-0.5">
        <label
          htmlFor={id}
          className="cursor-pointer text-[13.5px] font-medium text-ink"
        >
          {label}
        </label>
        {hint && (
          <p className="text-[12.5px] leading-snug text-muted">{hint}</p>
        )}
      </div>
    </div>
  );
}
