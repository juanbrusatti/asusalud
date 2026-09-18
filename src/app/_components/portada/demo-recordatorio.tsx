"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * El truco del producto, para tocar.
 *
 * Toda la portada se apoya en esto: en vez de explicar que los recordatorios
 * se contestan solos, se deja que la persona lo haga. Manda el recordatorio,
 * se pone del lado del cliente, aprieta un botón y ve la agenda cambiar.
 *
 * Los colores son los mismos que usa la agenda de verdad —verde confirmado,
 * ámbar movido— para que lo que se toca acá sea exactamente lo que se ve
 * después. Una demostración que miente es peor que no tener ninguna.
 */

type Estado = "espera" | "enviado" | "confirmado" | "movido";

const RELATO: Record<Estado, string> = {
  espera:
    "Sofía sacó turno hace tres semanas. Nadie sabe si se acuerda.",
  enviado: "El recordatorio salió. Ahora te toca a vos ser Sofía.",
  confirmado: "Sofía confirmó. La agenda ya lo sabe: no hiciste nada.",
  movido:
    "Sofía no podía y eligió otro horario. El lugar de las 15:00 quedó libre — a tiempo para dárselo a alguien.",
};

function Fila({
  hora,
  nombre,
  servicio,
  etiquetas,
  destacada,
}: {
  hora: string;
  nombre: string;
  servicio: string;
  etiquetas?: { texto: string; clase: string }[];
  destacada?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors ${
        destacada ? "bg-surface ring-[1.5px] ring-accent" : "bg-surface"
      }`}
    >
      <span className="w-11 shrink-0 text-[13px] tabular-nums text-faint">
        {hora}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{nombre}</span>
        <span className="block truncate text-[12.5px] text-muted">
          {servicio}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap justify-end gap-1">
        {etiquetas?.map((e) => (
          <span
            key={e.texto}
            className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${e.clase}`}
          >
            {e.texto}
          </span>
        ))}
      </span>
    </div>
  );
}

export function DemoRecordatorio() {
  const [estado, setEstado] = useState<Estado>("espera");
  const mandado = estado !== "espera";

  const etiquetasSofia =
    estado === "confirmado"
      ? [{ texto: "Confirmado", clase: "bg-ok-wash text-ok" }]
      : estado === "movido"
        ? [
            { texto: "Movido", clase: "bg-warn-wash text-warn" },
            { texto: "Confirmado", clase: "bg-ok-wash text-ok" },
          ]
        : [{ texto: "Sin confirmar", clase: "bg-surface-2 text-faint" }];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
      {/* La agenda */}
      <div className="rounded-card border-[1.5px] border-line bg-surface-2 p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-faint">
            Jueves 12
          </p>
          <p className="text-[12.5px] text-faint">Tu agenda</p>
        </div>

        <div className="grid gap-1.5">
          <Fila hora="14:00" nombre="Carla Benítez" servicio="Perfilado" />
          <Fila
            hora={estado === "movido" ? "17:30" : "15:00"}
            nombre="Sofía Ramírez"
            servicio="Limpieza facial"
            etiquetas={etiquetasSofia}
            destacada
          />
          <Fila hora="16:00" nombre="Lu Ferreyra" servicio="Masajes" />
        </div>

        {!mandado && (
          <div className="mt-4 flex">
            <Button size="sm" onClick={() => setEstado("enviado")}>
              Mandar el recordatorio
            </Button>
          </div>
        )}

        {mandado && estado !== "enviado" && (
          <button
            type="button"
            onClick={() => setEstado("espera")}
            className="mt-4 text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Probar de nuevo
          </button>
        )}
      </div>

      {/* El teléfono */}
      <div className="mx-auto w-full max-w-[19rem] rounded-[28px] border-[1.5px] border-line bg-surface p-2.5">
        <div className="rounded-[20px] bg-surface-2 p-3">
          <p className="mb-3 text-center text-[11.5px] font-semibold uppercase tracking-wider text-faint">
            El teléfono de Sofía
          </p>

          <div className="min-h-[13rem]">
            {!mandado ? (
              <p className="px-2 pt-10 text-center text-[13px] leading-relaxed text-faint">
                Acá va a llegar el recordatorio.
              </p>
            ) : (
              <div className="grid gap-2">
                <div className="rounded-[16px] rounded-tl-[4px] bg-surface p-3 text-[13px] leading-relaxed">
                  <p className="mb-1.5 font-semibold text-accent-text">
                    Estética Asusalud
                  </p>
                  <p>
                    Hola Sofía, te esperamos mañana a las 15:00 para tu limpieza
                    facial. ¿Confirmás?
                  </p>
                </div>

                {estado === "enviado" ? (
                  <div className="grid gap-1.5">
                    {(
                      [
                        ["Confirmar", "confirmado"],
                        ["Cambiar horario", "movido"],
                      ] as const
                    ).map(([texto, siguiente]) => (
                      <button
                        key={texto}
                        type="button"
                        onClick={() => setEstado(siguiente)}
                        className="rounded-[14px] border-[1.5px] border-line bg-surface py-2.5 text-[13.5px] font-medium text-accent-text hover:border-accent"
                      >
                        {texto}
                      </button>
                    ))}
                    <span className="rounded-[14px] border-[1.5px] border-line-soft bg-surface py-2.5 text-center text-[13.5px] text-faint">
                      Cancelar
                    </span>
                  </div>
                ) : (
                  <div className="ml-8 rounded-[16px] rounded-tr-[4px] bg-accent-wash p-3 text-right text-[13px] text-ink">
                    {estado === "confirmado"
                      ? "Confirmar"
                      : "Cambiar horario → 17:30"}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* El relato, que cambia con lo que hace la persona */}
      <p
        aria-live="polite"
        className="font-hand text-[26px] leading-snug text-accent-text lg:col-span-2"
      >
        {RELATO[estado]}
      </p>
    </div>
  );
}
