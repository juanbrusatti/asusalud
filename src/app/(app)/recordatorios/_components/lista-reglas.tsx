"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleRule } from "@/lib/actions/recordatorios";
import {
  CHANNEL_LABELS,
  TRIGGER_LABELS,
  describeOffset,
  type Channel,
  type RuleWithTemplates,
} from "@/lib/recordatorios";

export function ListaReglas({ rules }: { rules: RuleWithTemplates[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <ul className="grid gap-2">
      {rules.map((r) => {
        const canales = (r.channel_order as Channel[])
          .map((c) => CHANNEL_LABELS[c])
          .join(" → ");

        return (
          <li
            key={r.id}
            className={`flex items-center gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 py-3.5 ${
              r.enabled ? "" : "opacity-60"
            }`}
          >
            <Link href={`/recordatorios/${r.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-[15px] font-semibold">{r.name}</p>
                {r.only_if_missed && (
                  <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                    Sólo faltadoras
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {TRIGGER_LABELS[r.trigger]}
                {r.trigger !== "birthday" &&
                  ` · ${describeOffset(r.offset_minutes)}`}{" "}
                · {canales}
              </p>
            </Link>

            {/* Prender y apagar sin abrir la regla: es lo que más se usa. */}
            <button
              type="button"
              role="switch"
              aria-checked={r.enabled}
              aria-label={`${r.enabled ? "Apagar" : "Activar"} ${r.name}`}
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  void toggleRule(r.id, !r.enabled);
                })
              }
              className={`inline-flex h-6 w-11 shrink-0 items-center rounded-pill border-[1.5px] p-0.5 transition-colors disabled:opacity-50 ${
                r.enabled ? "border-accent bg-accent" : "border-line bg-surface-2"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full transition-transform ${
                  r.enabled ? "translate-x-5 bg-on-accent" : "translate-x-0 bg-faint"
                }`}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
