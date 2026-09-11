"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/**
 * Buscador con espera. Con 6.509 fichas no se puede consultar en cada tecla,
 * pero tampoco se puede obligar a apretar Enter: se espera un cuarto de
 * segundo desde la última tecla.
 */
export function Buscador({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("pagina");

      startTransition(() => {
        router.replace(`${pathname}?${next}`, { scroll: false });
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <div className="relative flex-1">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por nombre, teléfono o correo…"
        aria-label="Buscar clienta"
        className="h-11 w-full rounded-pill border-[1.5px] border-line bg-surface px-4 text-[15px] text-ink placeholder:text-faint"
      />
      {pending && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-faint">
          buscando…
        </span>
      )}
    </div>
  );
}
