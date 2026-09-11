"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDuration, formatPrice } from "@/lib/money";
import type { ServiceWithCategory } from "@/lib/data/services";

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={`rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${
        tone === "accent"
          ? "bg-accent-wash text-accent-text"
          : "bg-surface-2 text-faint"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Listado con buscador. Asusalud tiene 28 servicios y varios con nombres
 * parecidos, así que escribir dos letras tiene que alcanzar para llegar.
 */
export function ServiceList({
  services,
  canEdit,
}: {
  services: ServiceWithCategory[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category?.name.toLowerCase().includes(q),
    );
  }, [services, query]);

  const activos = filtered.filter((s) => s.is_active).length;

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar servicio…"
          aria-label="Buscar servicio"
          className="h-11 flex-1 rounded-pill border-[1.5px] border-line bg-surface px-4 text-[15px] text-ink placeholder:text-faint"
        />
        <p className="shrink-0 text-[13px] tabular-nums text-muted">
          {activos} {activos === 1 ? "activo" : "activos"}
          {filtered.length !== activos && ` · ${filtered.length - activos} pausados`}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-card border-[1.5px] border-line bg-surface px-5 py-8 text-center text-[14.5px] text-muted">
          No hay ningún servicio que coincida con “{query}”.
        </p>
      ) : (
        <ul className="grid gap-2">
          {filtered.map((s) => {
            const content = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-[15px] font-semibold">{s.name}</p>
                    {!s.is_active && <Badge>Pausado</Badge>}
                    {s.capacity > 1 && (
                      <Badge tone="accent">{s.capacity} a la vez</Badge>
                    )}
                    {!s.is_bookable_online && <Badge>Solo en el local</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    {formatDuration(s.duration_minutes)}
                    {s.buffer_minutes > 0 &&
                      ` + ${s.buffer_minutes} de limpieza`}
                    {s.category && ` · ${s.category.name}`}
                  </p>
                </div>

                <p
                  className={`shrink-0 text-[15px] tabular-nums ${
                    s.price_cents === null
                      ? "text-[13px] text-faint"
                      : "font-semibold"
                  }`}
                >
                  {formatPrice(s.price_cents)}
                </p>
              </>
            );

            const rowClass = `flex items-center gap-4 rounded-card border-[1.5px] border-line bg-surface px-4 py-3.5 ${
              s.is_active ? "" : "opacity-55"
            }`;

            return (
              <li key={s.id}>
                {canEdit ? (
                  <Link
                    href={`/servicios/${s.id}`}
                    className={`${rowClass} hover:border-accent`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
