import type { ComponentProps, ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { VIGENCIA } from "../datos";

/**
 * La hoja de un texto legal.
 *
 * Son páginas para leer, no para operar: una sola columna angosta, jerarquía
 * clara y nada que distraiga. También son las páginas que abre quien revisa
 * en Meta, así que tienen que verse como parte del producto, no como un
 * documento pegado aparte.
 */
export function Hoja({
  titulo,
  entrada,
  children,
}: {
  titulo: string;
  entrada: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto grid max-w-[68ch] gap-10 px-5 py-12 sm:py-16">
      <header className="grid gap-4">
        <Logo className="h-10 w-10" />
        <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.035em]">
          {titulo}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted">{entrada}</p>
        <p className="text-[13px] text-faint">Última actualización: {VIGENCIA}</p>
      </header>
      <div className="grid gap-9">{children}</div>
    </main>
  );
}

export function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.02em]">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export function Parrafo({ className = "", ...props }: ComponentProps<"p">) {
  return (
    <p
      className={`text-[15px] leading-relaxed text-muted ${className}`}
      {...props}
    />
  );
}

export function Lista({ items }: { items: ReactNode[] }) {
  return (
    <ul className="grid gap-2 text-[15px] leading-relaxed text-muted">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-faint" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
