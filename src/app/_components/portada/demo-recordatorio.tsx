"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * El truco del producto, para tocar.
 *
 * Toda la portada se apoya en esto: en vez de explicar que los recordatorios
 * se contestan solos, se deja que la persona lo haga. Adelanta el reloj, el
 * recordatorio sale, se pone del lado del cliente y ve la agenda cambiar.
 *
 * Todo lo que aparece es copia de lo que pasa adentro: el texto es el de la
 * plantilla de fábrica, los tres botones son los que aprueba Meta, las
 * respuestas son las que manda el webhook palabra por palabra, y la agenda usa
 * las mismas etiquetas y colores que la de verdad. Una demostración que miente
 * es peor que no tener ninguna.
 */

const NEGOCIO = "Estudio Malva";

type Fase =
  | "antes"
  | "enviado"
  | "confirmado"
  | "cancelado"
  | "enlace"
  | "movido";

type Estado = "pending" | "confirmed" | "cancelled";

type Turno = {
  id: string;
  hora: string;
  fin: string;
  nombre: string;
  servicio: string;
  precio: string;
  estado: Estado;
  movido?: boolean;
  alerta?: boolean;
};

const ETIQUETA: Record<Estado, [string, string]> = {
  pending: ["Sin confirmar", "bg-surface-2 text-muted"],
  confirmed: ["Confirmado", "bg-ok-wash text-ok"],
  cancelled: ["Cancelado", "bg-surface-2 text-faint"],
};

const RELATO: Record<Fase, string> = {
  antes:
    "Mañana vienen cuatro. Nadie sabe todavía quién se acuerda.",
  enviado:
    "Salió solo, a todos los de mañana. Ahora sos Sofía: tocá un botón.",
  confirmado:
    "Sofía confirmó y la agenda ya lo sabe. No tocaste nada.",
  cancelado:
    "Sofía no puede venir. Las 15:00 quedaron libres con un día de margen para dárselas a otra persona.",
  enlace:
    "Le llegó su enlace. Tocalo y elegí otro horario, como haría Sofía.",
  movido:
    "Sofía se movió sola a otro horario. Nadie tuvo que llamar a nadie.",
};

/** Los horarios libres que vería Sofía en su enlace. */
const LIBRES: Record<string, string[]> = {
  "jue 12": ["11:00", "17:30", "18:00"],
  "vie 13": ["09:30", "15:00", "16:30"],
};

function Pastilla({ texto, clase }: { texto: string; clase: string }) {
  return (
    <span
      className={`rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${clase}`}
    >
      {texto}
    </span>
  );
}

function FilaTurno({ t, destacada }: { t: Turno; destacada: boolean }) {
  const [etiqueta, clase] = ETIQUETA[t.estado];
  const cancelado = t.estado === "cancelled";
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] gap-2.5">
      <p className="pt-3 text-[13px] font-semibold tabular-nums text-muted">
        {t.hora}
      </p>
      <div
        className={`flex items-center gap-3 rounded-card border-[1.5px] bg-surface px-3.5 py-2.5 transition-[border-color,opacity] duration-300 ${
          destacada ? "border-accent" : "border-line"
        } ${cancelado ? "opacity-55" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-[14px] font-semibold">{t.nombre}</p>
            {t.alerta && (
              <Pastilla texto="Atención" clase="bg-warn-wash text-warn" />
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">
            {t.servicio} · {t.hora}–{t.fin}
          </p>
        </div>
        <div className="grid shrink-0 justify-items-end gap-1">
          <div className="flex flex-wrap justify-end gap-1">
            {t.movido && !cancelado && (
              <Pastilla texto="Movido" clase="bg-warn-wash text-warn" />
            )}
            <Pastilla texto={etiqueta} clase={clase} />
          </div>
          <span className="text-[12.5px] tabular-nums text-muted">
            {t.precio}
          </span>
        </div>
      </div>
    </li>
  );
}

function Burbuja({
  children,
  propia,
  hora,
}: {
  children: React.ReactNode;
  propia?: boolean;
  hora: string;
}) {
  return (
    <div
      className={`max-w-[88%] rounded-[14px] px-3 py-2 text-[13px] leading-relaxed ${
        propia
          ? "ml-auto rounded-tr-[4px] bg-accent-wash text-ink"
          : "rounded-tl-[4px] bg-surface"
      }`}
    >
      {children}
      <span className="mt-0.5 block text-right text-[10.5px] tabular-nums text-faint">
        {hora}
      </span>
    </div>
  );
}

const INICIALES: Turno[] = [
  {
    id: "mica",
    hora: "10:00",
    fin: "11:00",
    nombre: "Mica Sosa",
    servicio: "Uñas semipermanentes",
    precio: "$ 14.000",
    estado: "pending",
  },
  {
    id: "carla",
    hora: "14:00",
    fin: "14:30",
    nombre: "Carla Benítez",
    servicio: "Perfilado de cejas",
    precio: "$ 9.000",
    estado: "pending",
  },
  {
    id: "sofia",
    hora: "15:00",
    fin: "16:00",
    nombre: "Sofía Ramírez",
    servicio: "Limpieza facial",
    precio: "$ 25.000",
    estado: "pending",
    alerta: true,
  },
  {
    id: "lu",
    hora: "16:00",
    fin: "17:00",
    nombre: "Lu Ferreyra",
    servicio: "Masaje descontracturante",
    precio: "$ 18.000",
    estado: "pending",
  },
];

export function DemoRecordatorio() {
  const [fase, setFase] = useState<Fase>("antes");
  const [turnos, setTurnos] = useState<Turno[]>(INICIALES);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dia, setDia] = useState("jue 12");
  const [nuevaHora, setNuevaHora] = useState<string | null>(null);

  const enviado = fase !== "antes";

  function cambiar(id: string, cambio: Partial<Turno>) {
    setTurnos((ts) =>
      ts
        .map((t) => (t.id === id ? { ...t, ...cambio } : t))
        .sort((a, b) => a.hora.localeCompare(b.hora)),
    );
  }

  // Los demás también contestan, cada uno a su ritmo, y la agenda se entera
  // en vivo como adentro. Lu no contesta: siempre hay alguien que no.
  useEffect(() => {
    if (!enviado) return;
    const timers = [
      setTimeout(() => {
        cambiar("carla", { estado: "confirmed" });
        setAviso("Carla Benítez confirmó desde WhatsApp");
      }, 2600),
      setTimeout(() => {
        cambiar("mica", { estado: "confirmed" });
        setAviso("Mica Sosa confirmó desde WhatsApp");
      }, 6200),
    ];
    return () => timers.forEach(clearTimeout);
    // Sólo cuando sale el recordatorio; reiniciar vuelve a "antes".
  }, [enviado]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  function responder(accion: "confirmar" | "cancelar" | "reprogramar") {
    if (accion === "confirmar") {
      cambiar("sofia", { estado: "confirmed" });
      setAviso("Sofía Ramírez confirmó desde WhatsApp");
      setFase("confirmado");
    } else if (accion === "cancelar") {
      cambiar("sofia", { estado: "cancelled" });
      setAviso("Sofía Ramírez canceló desde WhatsApp");
      setFase("cancelado");
    } else {
      setFase("enlace");
    }
  }

  function mover(hora: string, enDia: string) {
    setNuevaHora(`${enDia} a las ${hora}`);
    if (enDia === "jue 12") {
      const [h, m] = hora.split(":").map(Number);
      const fin = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      cambiar("sofia", { hora, fin, movido: true });
    } else {
      // Se fue a otro día: de la agenda de mañana desaparece.
      setTurnos((ts) => ts.filter((t) => t.id !== "sofia"));
    }
    setAviso("Sofía Ramírez cambió su turno");
    setFase("movido");
  }

  function reiniciar() {
    setFase("antes");
    setTurnos(INICIALES);
    setAviso(null);
    setNuevaHora(null);
    setDia("jue 12");
  }

  const pendientes = turnos.filter((t) => t.estado === "pending").length;
  const respuestaSofia: Record<string, string> = {
    confirmado: "Confirmar turno",
    cancelado: "Cancelar turno",
    enlace: "Cambiar horario",
    movido: "Cambiar horario",
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] lg:items-start">
      {/* La agenda, igual que adentro */}
      <div className="relative grid gap-3 rounded-card border-[1.5px] border-line bg-surface-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-faint">
              Agenda
            </p>
            <p className="text-[18px] font-bold tracking-[-0.02em]">
              Mañana, jueves 12
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-pill border-[1.5px] border-line bg-surface px-2.5 py-1 text-[12px] text-muted">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${enviado ? "bg-ok" : "bg-faint"}`}
            />
            {pendientes === 0
              ? "Todos respondieron"
              : `${pendientes} sin confirmar`}
          </span>
        </div>

        <ul className="grid gap-2">
          {turnos.map((t) => (
            <FilaTurno
              key={t.id}
              t={t}
              destacada={t.id === "sofia" && enviado}
            />
          ))}
        </ul>

        {/* El aviso en vivo: adentro, además, suena */}
        <div aria-live="polite" className="min-h-[2.25rem]">
          {aviso && (
            <p className="inline-flex items-center gap-2 rounded-pill bg-ink px-3.5 py-2 text-[12.5px] font-medium text-surface">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
              {aviso}
            </p>
          )}
        </div>

        {!enviado ? (
          <div className="grid gap-2 border-t-[1.5px] border-line pt-3">
            <p className="text-[13px] leading-relaxed text-muted">
              Un día antes, a la hora que elijas, Dlay le manda el recordatorio
              a cada uno. Solo, sin que nadie apriete nada.
            </p>
            <div className="flex">
              <Button size="sm" onClick={() => setFase("enviado")}>
                Adelantar el reloj a hoy, 10:00
              </Button>
            </div>
          </div>
        ) : (
          fase !== "enviado" &&
          fase !== "enlace" && (
            <button
              type="button"
              onClick={reiniciar}
              className="justify-self-start text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Probar otra respuesta
            </button>
          )
        )}
      </div>

      {/* El WhatsApp de Sofía */}
      <div className="mx-auto w-full max-w-[20rem] rounded-[30px] border-[1.5px] border-line bg-surface p-2">
        <div className="overflow-hidden rounded-[22px] bg-surface-2">
          <div className="flex items-center gap-2.5 border-b-[1.5px] border-line bg-surface px-3 py-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[13px] font-semibold text-on-accent"
            >
              M
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold">
                {NEGOCIO}
              </span>
              <span className="block text-[11px] text-faint">
                Cuenta de empresa
              </span>
            </span>
          </div>

          <div className="grid min-h-[22rem] content-start gap-2 p-3">
            {!enviado ? (
              <p className="px-3 pt-24 text-center text-[13px] leading-relaxed text-faint">
                El WhatsApp de Sofía. Acá le va a llegar el recordatorio.
              </p>
            ) : (
              <>
                <div className="max-w-[92%]">
                  <Burbuja hora="10:00">
                    Hola Sofía! Te escribimos de {NEGOCIO} para recordarte tu
                    turno de mañana jueves 12 de marzo a las 15:00, para
                    limpieza facial. Vení con la cara lavada y sin maquillaje.
                    Con los botones de acá abajo podés confirmar el turno o
                    avisarnos que no vas a venir. ¡Te esperamos!
                  </Burbuja>
                  <div className="mt-1 grid gap-1">
                    {(
                      [
                        ["Confirmar turno", "confirmar"],
                        ["Cancelar turno", "cancelar"],
                        ["Cambiar horario", "reprogramar"],
                      ] as const
                    ).map(([texto, accion]) => (
                      <button
                        key={accion}
                        type="button"
                        disabled={fase !== "enviado"}
                        onClick={() => responder(accion)}
                        className="rounded-[12px] bg-surface py-2 text-[13px] font-medium text-accent-text transition-colors enabled:hover:bg-accent-wash disabled:text-faint"
                      >
                        {texto}
                      </button>
                    ))}
                  </div>
                </div>

                {fase !== "enviado" && (
                  <Burbuja propia hora="10:04">
                    {respuestaSofia[fase]}
                  </Burbuja>
                )}

                {fase === "confirmado" && (
                  <Burbuja hora="10:04">
                    ¡Gracias! Quedó confirmado. Te esperamos.
                  </Burbuja>
                )}
                {fase === "cancelado" && (
                  <Burbuja hora="10:04">
                    Listo, cancelamos tu turno. Cuando quieras sacás otro.
                  </Burbuja>
                )}
                {(fase === "enlace" || fase === "movido") && (
                  <Burbuja hora="10:04">
                    Elegí el horario que te quede mejor acá:{" "}
                    <span className="whitespace-nowrap text-accent-text underline">
                      dlay-agenda.vercel.app/t/k3f9q2
                    </span>
                  </Burbuja>
                )}

                {/* Lo que abre el enlace, en chiquito */}
                {fase === "enlace" && (
                  <div className="grid gap-2.5 rounded-[14px] border-[1.5px] border-accent bg-surface p-3">
                    <p className="text-[13.5px] font-semibold">
                      ¿Cuándo te queda cómodo?
                    </p>
                    <div className="flex gap-1.5">
                      {Object.keys(LIBRES).map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={d === dia}
                          onClick={() => setDia(d)}
                          className={`rounded-pill border-[1.5px] px-3 py-1 text-[12.5px] font-medium capitalize ${
                            d === dia
                              ? "border-accent bg-accent text-on-accent"
                              : "border-line bg-surface text-muted"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {LIBRES[dia].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => mover(h, dia)}
                          className="rounded-pill border-[1.5px] border-line bg-surface px-3 py-1 text-[12.5px] tabular-nums hover:border-accent"
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {fase === "movido" && nuevaHora && (
                  <div className="rounded-[14px] bg-surface p-3 text-[12.5px] leading-relaxed">
                    <p className="text-[13.5px] font-semibold">
                      Listo, lo movimos
                    </p>
                    <p className="text-muted">
                      Tu turno quedó para el {nuevaHora}.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* El relato, que cambia con lo que hace la persona */}
      <p
        aria-live="polite"
        className="font-hand text-[26px] leading-snug text-accent-text lg:col-span-2"
      >
        {fase === "movido" && nuevaHora && !nuevaHora.startsWith("jue")
          ? "Sofía pasó su turno al viernes. Las 15:00 de mañana quedaron libres para otra persona."
          : RELATO[fase]}
      </p>
    </div>
  );
}
