"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/money";

/**
 * ¿Me conviene?
 *
 * Los números los pone quien mira. No hay ninguna estadística de industria
 * acá, y es a propósito: inventar un «35% de ausentismo promedio» es lo que
 * hace que una página de ventas no se crea. Con los números propios, la cuenta
 * la hace la persona y no hay nada que discutir.
 *
 * Tampoco se promete que los recordatorios hagan venir a nadie. Lo que hacen
 * es que quien no va a venir avise a tiempo, y ese lugar se pueda dar. La
 * comparación es contra eso: un turno recuperado por semana.
 */

function Deslizador({
  etiqueta,
  valor,
  min,
  max,
  paso,
  onChange,
  formato,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  onChange: (v: number) => void;
  formato: (v: number) => string;
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] text-muted">{etiqueta}</span>
        <span className="font-hand text-[30px] leading-none text-accent-text tabular-nums">
          {formato(valor)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-pill bg-line accent-accent"
      />
    </label>
  );
}

const SEMANAS_POR_MES = 4.33;

export function Calculadora() {
  const [turnos, setTurnos] = useState(30);
  const [precio, setPrecio] = useState(20000);

  const facturadoMes = turnos * SEMANAS_POR_MES * precio;
  // El 3% de fábrica. Es el mismo número que cobra el sistema de verdad.
  const cuestaDlay = Math.round(facturadoMes * 0.03);
  const unTurnoPorSemana = Math.round(SEMANAS_POR_MES * precio);
  const veces = cuestaDlay > 0 ? unTurnoPorSemana / cuestaDlay : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
      <div className="grid content-start gap-6">
        <Deslizador
          etiqueta="Turnos por semana"
          valor={turnos}
          min={5}
          max={500}
          paso={5}
          onChange={setTurnos}
          formato={(v) => String(v)}
        />
        <Deslizador
          etiqueta="Lo que cobrás por turno, en promedio"
          valor={precio}
          min={3000}
          max={80000}
          paso={1000}
          onChange={setPrecio}
          formato={(v) => formatPrice(v * 100)}
        />
      </div>

      <div className="grid content-start gap-4">
        <div className="rounded-card border-[1.5px] border-line bg-surface p-5">
          <p className="text-[13px] uppercase tracking-wider text-faint">
            Dlay te sale
          </p>
          <p className="mt-1 font-hand text-[40px] leading-none text-ink">
            {formatPrice(cuestaDlay * 100)}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            por mes · el 3% de {formatPrice(Math.round(facturadoMes) * 100)}
          </p>
        </div>

        <div className="rounded-card border-[1.5px] border-accent bg-accent p-5 text-on-accent">
          <p className="text-[13px] uppercase tracking-wider opacity-75">
            Un solo turno recuperado por semana
          </p>
          <p className="mt-1 font-hand text-[40px] leading-none">
            {formatPrice(unTurnoPorSemana * 100)}
          </p>
          <p className="mt-1.5 text-[13px] opacity-90">
            {veces >= 1
              ? `Eso es ${veces.toFixed(1)} veces lo que te sale Dlay.`
              : "Con eso ya cubrís buena parte de lo que te sale Dlay."}
          </p>
        </div>

        <p className="text-[13.5px] leading-relaxed text-muted">
          Un recordatorio no hace venir a nadie. Lo que hace es que quien no va
          a poder venir te avise <em>a tiempo</em>, y ese lugar se lo puedas dar
          a otra persona. Con que eso pase una vez por semana, la cuenta ya
          cierra.
        </p>
      </div>
    </div>
  );
}
