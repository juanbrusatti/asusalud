"use client";

import { useState, type ReactNode } from "react";
import { formatPrice } from "@/lib/money";

/**
 * Lo que hay adentro, en miniatura.
 *
 * Cada pieza es un pedazo de la pantalla de verdad, con el mismo lenguaje
 * visual. Una lista de funciones con tildes se lee y se olvida; esto se mira
 * y se reconoce después, cuando la persona entra.
 */

type Pieza = {
  clave: string;
  titulo: string;
  frase: string;
  cuerpo: ReactNode;
};

function Renglon({
  izquierda,
  derecha,
  abajo,
  acento,
}: {
  izquierda: string;
  derecha?: string;
  abajo?: string;
  acento?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-surface px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">
          {izquierda}
        </span>
        {abajo && (
          <span className="block truncate text-[12px] text-muted">{abajo}</span>
        )}
      </span>
      {derecha && (
        <span
          className={`shrink-0 text-[13.5px] tabular-nums ${
            acento ? "text-accent-text" : "text-muted"
          }`}
        >
          {derecha}
        </span>
      )}
    </div>
  );
}

const PIEZAS: Pieza[] = [
  {
    clave: "agenda",
    titulo: "La agenda",
    frase: "El día entero en una pantalla, con quién viene y a qué.",
    cuerpo: (
      <div className="grid gap-1.5">
        <Renglon izquierda="Carla Benítez" abajo="Perfilado · 14:00" derecha="$ 9.000" />
        <Renglon izquierda="Sofía Ramírez" abajo="Limpieza facial · 15:00" derecha="$ 25.000" />
        <Renglon izquierda="Lu Ferreyra" abajo="Masajes · 16:00" derecha="$ 18.000" />
      </div>
    ),
  },
  {
    clave: "clientes",
    titulo: "Las fichas",
    frase: "Todo lo que sabés de cada persona, donde lo vas a buscar.",
    cuerpo: (
      <div className="grid gap-2">
        <div className="rounded-[12px] bg-warn-wash px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-warn">
            Atención
          </p>
          <p className="text-[13px] text-ink">Alérgica al ácido glicólico.</p>
        </div>
        <Renglon izquierda="Sofía Ramírez" abajo="+54 9 358 412-3456" />
        <Renglon izquierda="Última visita" derecha="hace 3 semanas" />
        <Renglon izquierda="Viene desde" derecha="marzo de 2024" />
      </div>
    ),
  },
  {
    clave: "caja",
    titulo: "La caja",
    frase: "Lo que entró y lo que salió, para cerrar el día sin cuaderno.",
    cuerpo: (
      <div className="grid gap-1.5">
        <Renglon izquierda="Limpieza facial · Sofía" derecha="+ $ 25.000" acento />
        <Renglon izquierda="Perfilado · Carla" derecha="+ $ 9.000" acento />
        <Renglon izquierda="Insumos" derecha="− $ 12.400" />
        <div className="mt-1 flex items-center justify-between rounded-[12px] bg-accent px-3 py-2.5 text-on-accent">
          <span className="text-[13.5px] font-medium">En el cajón</span>
          <span className="font-hand text-[24px] leading-none">
            {formatPrice(2160000)}
          </span>
        </div>
      </div>
    ),
  },
  {
    clave: "reserva",
    titulo: "La reserva online",
    frase: "Tu enlace, para que saquen turno mientras dormís.",
    cuerpo: (
      <div className="grid gap-2">
        <p className="rounded-[12px] bg-surface px-3 py-2 text-[12.5px] text-muted">
          dlay-agenda.vercel.app/r/<span className="text-ink">tu-negocio</span>
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {["09:00", "09:30", "10:00", "10:30", "14:00", "14:30", "15:00", "15:30"].map(
            (h, i) => (
              <span
                key={h}
                className={`rounded-[10px] py-1.5 text-center text-[12px] ${
                  i === 5
                    ? "bg-accent text-on-accent"
                    : i === 2
                      ? "bg-surface-2 text-faint line-through"
                      : "bg-surface text-ink"
                }`}
              >
                {h}
              </span>
            ),
          )}
        </div>
      </div>
    ),
  },
];

export function QueHace() {
  const [activa, setActiva] = useState(PIEZAS[0].clave);
  const pieza = PIEZAS.find((p) => p.clave === activa)!;

  return (
    <div className="grid gap-5">
      <div
        role="tablist"
        aria-label="Partes del sistema"
        className="flex flex-wrap gap-2"
      >
        {PIEZAS.map((p) => (
          <button
            key={p.clave}
            role="tab"
            aria-selected={activa === p.clave}
            onClick={() => setActiva(p.clave)}
            className={`rounded-pill border-[1.5px] px-4 py-2 text-[14px] font-medium transition-colors ${
              activa === p.clave
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-surface text-muted hover:border-accent hover:text-ink"
            }`}
          >
            {p.titulo}
          </button>
        ))}
      </div>

      <div className="grid gap-4 rounded-card border-[1.5px] border-line bg-surface-2 p-4 sm:p-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-8">
        <p className="font-hand text-[28px] leading-snug text-accent-text">
          {pieza.frase}
        </p>
        <div>{pieza.cuerpo}</div>
      </div>
    </div>
  );
}
