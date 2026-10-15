"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { formatPrice } from "@/lib/money";
import { ABONO_MENSUAL_CENTS } from "@/lib/precio";

/**
 * Un día con Dlay, en un minuto y sin tocar nada.
 *
 * La demo de los botones muestra una sola cosa a fondo; esta muestra todo lo
 * demás de pasada, como un video: arranca sola apenas se abre la página y da
 * la vuelta. No es un video de verdad porque un video pesa megas, se ve
 * borroso en un celular y queda viejo con cada cambio de pantalla. Esto son
 * las mismas piezas de la aplicación, con los mismos textos, colores y
 * etiquetas, así que lo que se ve acá es lo que se encuentra adentro.
 *
 * Se frena sola cuando no está a la vista o la pestaña queda en segundo plano,
 * y quien pidió menos movimiento la ve quieta, escena por escena.
 */

const NEGOCIO = "Estudio Malva";

type Pantalla = "telefono" | "sistema" | "cierre";

type Escena = {
  clave: string;
  capitulo: string;
  duracion: number;
  pantalla: Pantalla;
  /** La dirección que se ve arriba, como en el navegador. */
  ruta?: string;
  /** La sección marcada en la barra del sistema. */
  seccion?: string;
  hora: string;
  relato: string;
  /** Un chat: lo nuevo entra abajo y lo viejo sube, como en WhatsApp. */
  chat?: boolean;
  dibujar: (t: number) => ReactNode;
};

/** ¿Ya pasó este momento de la escena? */
const ya = (t: number, ms: number) => t >= ms;

/** Un número que sube de 0 a `valor` entre `desde` y `desde + dura`. */
function contar(valor: number, t: number, desde: number, dura = 1200) {
  const p = Math.min(1, Math.max(0, (t - desde) / dura));
  return Math.round(valor * (1 - (1 - p) ** 3));
}

function Pastilla({ texto, clase }: { texto: string; clase: string }) {
  return (
    <span
      className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors duration-500 ${clase}`}
    >
      {texto}
    </span>
  );
}

const SIN_CONFIRMAR = "bg-surface-2 text-muted";
const CONFIRMADO = "bg-ok-wash text-ok";

function Turno({
  hora,
  nombre,
  servicio,
  estado,
  clase,
  nuevo,
  resaltado,
  sinHora,
}: {
  hora: string;
  nombre: string;
  servicio: string;
  estado: string;
  clase: string;
  nuevo?: boolean;
  resaltado?: boolean;
  /** Donde no entra la columna de la hora, va junto al servicio. */
  sinHora?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 ${sinHora ? "" : "grid-cols-[40px_minmax(0,1fr)]"} ${nuevo ? "demo-aparece" : ""}`}
    >
      {!sinHora && (
        <p className="pt-2.5 text-[12px] font-semibold tabular-nums text-muted">
          {hora}
        </p>
      )}
      <div
        className={`flex items-center gap-2 rounded-[14px] border-[1.5px] bg-surface px-3 py-2 transition-colors duration-500 ${
          resaltado ? "border-accent" : "border-line"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{nombre}</p>
          <p className="truncate text-[11.5px] text-muted">{servicio}</p>
        </div>
        <Pastilla texto={estado} clase={clase} />
      </div>
    </div>
  );
}

/** El dedo: marca lo que se está tocando en ese momento. */
function Toque({ activo, children }: { activo: boolean; children: ReactNode }) {
  return (
    <span
      className={`relative block rounded-[12px] transition-transform duration-200 ${
        activo ? "scale-[0.97]" : ""
      }`}
    >
      {children}
      {activo && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-accent/30"
        />
      )}
    </span>
  );
}

function Opcion({
  texto,
  elegida,
  tocando,
  className = "",
}: {
  texto: string;
  elegida?: boolean;
  tocando?: boolean;
  className?: string;
}) {
  return (
    <Toque activo={Boolean(tocando)}>
      <span
        className={`block rounded-[12px] border-[1.5px] px-3 py-2 text-[12.5px] transition-colors duration-300 ${
          elegida
            ? "border-accent bg-accent text-on-accent"
            : "border-line bg-surface text-ink"
        } ${className}`}
      >
        {texto}
      </span>
    </Toque>
  );
}

function Burbuja({
  children,
  propia,
  hora,
}: {
  children: ReactNode;
  propia?: boolean;
  hora: string;
}) {
  return (
    <div
      className={`demo-aparece max-w-[88%] rounded-[14px] px-3 py-2 text-[12.5px] leading-relaxed ${
        propia
          ? "ml-auto rounded-tr-[4px] bg-accent-wash text-ink"
          : "rounded-tl-[4px] bg-surface"
      }`}
    >
      {children}
      <span className="mt-0.5 block text-right text-[10px] tabular-nums text-faint">
        {hora}
      </span>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  acento,
}: {
  etiqueta: string;
  valor: string;
  acento?: boolean;
}) {
  return (
    <div className="rounded-[14px] bg-surface px-3 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">
        {etiqueta}
      </p>
      <p
        className={`mt-0.5 text-[17px] font-bold tabular-nums tracking-[-0.02em] ${
          acento ? "text-accent-text" : ""
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Las escenas
// ---------------------------------------------------------------------------

const ESCENAS: Escena[] = [
  {
    clave: "reserva",
    capitulo: "Reserva online",
    duracion: 7200,
    pantalla: "telefono",
    ruta: "dlay-agenda.vercel.app/r/estudio-malva",
    hora: "Martes 23:40",
    relato:
      "Son las 23:40. Sofía saca turno desde el celular, sin escribirte ni esperar respuesta.",
    dibujar: (t) => (
      <div className="grid gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            {NEGOCIO}
          </p>
          <p className="text-[17px] font-bold tracking-[-0.02em]">
            Reservar turno
          </p>
        </div>
        <div className="grid gap-1.5">
          {["Limpieza facial · 60 min", "Perfilado de cejas · 30 min"].map(
            (s, i) => (
              <Opcion
                key={s}
                texto={s}
                elegida={i === 0 && ya(t, 1300)}
                tocando={i === 0 && ya(t, 1000) && !ya(t, 1500)}
              />
            ),
          )}
        </div>
        {ya(t, 1700) && (
          <div className="demo-aparece flex gap-1.5">
            {["mié 11", "jue 12", "vie 13"].map((d) => (
              <Opcion
                key={d}
                texto={d}
                elegida={d === "jue 12" && ya(t, 2600)}
                tocando={d === "jue 12" && ya(t, 2300) && !ya(t, 2800)}
                className="rounded-pill text-center"
              />
            ))}
          </div>
        )}
        {ya(t, 3000) && (
          <div className="demo-aparece grid grid-cols-4 gap-1.5">
            {["10:00", "11:00", "15:00", "17:30"].map((h) => (
              <Opcion
                key={h}
                texto={h}
                elegida={h === "15:00" && ya(t, 3900)}
                tocando={h === "15:00" && ya(t, 3600) && !ya(t, 4100)}
                className="text-center tabular-nums"
              />
            ))}
          </div>
        )}
        {ya(t, 5000) && (
          <div className="demo-aparece rounded-[14px] bg-ok-wash px-3.5 py-3">
            <p className="text-[14px] font-semibold text-ok">
              ¡Listo! Tu turno quedó reservado
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              Jueves 12 a las 15:00 · Limpieza facial
            </p>
          </div>
        )}
      </div>
    ),
  },
  {
    clave: "agenda",
    capitulo: "Agenda",
    duracion: 6200,
    pantalla: "sistema",
    ruta: "dlay-agenda.vercel.app/agenda",
    seccion: "Agenda",
    hora: "Miércoles 8:15",
    relato:
      "A la mañana ya está en tu agenda. Y si instalaste la aplicación, te avisó al celular en el momento.",
    dibujar: (t) => (
      <div className="relative grid gap-2.5">
        <p className="text-[16px] font-bold tracking-[-0.02em]">Jueves 12</p>
        <Turno hora="10:00" nombre="Mica Sosa" servicio="Uñas semipermanentes" estado="Sin confirmar" clase={SIN_CONFIRMAR} />
        <Turno hora="14:00" nombre="Carla Benítez" servicio="Perfilado de cejas" estado="Sin confirmar" clase={SIN_CONFIRMAR} />
        {ya(t, 2600) && (
          <Turno
            hora="15:00"
            nombre="Sofía Ramírez"
            servicio="Limpieza facial · 15:00–16:00"
            estado="Sin confirmar"
            clase={SIN_CONFIRMAR}
            nuevo
            resaltado
          />
        )}
        <Turno hora="16:00" nombre="Lu Ferreyra" servicio="Masaje descontracturante" estado="Sin confirmar" clase={SIN_CONFIRMAR} />

        {ya(t, 900) && !ya(t, 5200) && (
          <div className="demo-aparece absolute -top-1 right-0 w-[min(100%,17rem)] rounded-[16px] border-[1.5px] border-line bg-surface p-3 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)]">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">
              Dlay · ahora
            </p>
            <p className="text-[13px] font-semibold">Reserva nueva</p>
            <p className="text-[12px] text-muted">
              Sofía Ramírez · Limpieza facial · jue 12, 15:00
            </p>
          </div>
        )}
      </div>
    ),
  },
  {
    clave: "recordatorio",
    capitulo: "Recordatorio",
    duracion: 8200,
    pantalla: "telefono",
    chat: true,
    hora: "Miércoles 10:00",
    relato:
      "Un día antes, el recordatorio sale solo por WhatsApp. Sofía confirma con un botón y la agenda se entera sola.",
    dibujar: (t) => (
      <div className="grid gap-2">
        <div className="flex items-center gap-2 border-b-[1.5px] border-line pb-2">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[12px] font-semibold text-on-accent">
            M
          </span>
          <span className="text-[13px] font-semibold">{NEGOCIO}</span>
        </div>
        {ya(t, 700) && (
          <div className="grid max-w-[94%] gap-1">
            <Burbuja hora="10:00">
              Hola Sofía! Te escribimos de {NEGOCIO} para recordarte tu turno
              de mañana jueves 12 a las 15:00, para limpieza facial. Vení con la
              cara lavada y sin maquillaje. ¡Te esperamos!
            </Burbuja>
            {["Confirmar turno", "Cancelar turno", "Cambiar horario"].map(
              (b, i) => (
                <Toque key={b} activo={i === 0 && ya(t, 2600) && !ya(t, 3200)}>
                  <span className="demo-aparece block rounded-[12px] bg-surface py-1.5 text-center text-[12.5px] font-medium text-accent-text">
                    {b}
                  </span>
                </Toque>
              ),
            )}
          </div>
        )}
        {ya(t, 3200) && (
          <Burbuja propia hora="10:04">
            Confirmar turno
          </Burbuja>
        )}
        {ya(t, 3900) && (
          <Burbuja hora="10:04">¡Gracias! Quedó confirmado. Te esperamos.</Burbuja>
        )}
        {ya(t, 5000) && (
          <div className="demo-aparece mt-1 rounded-[14px] border-[1.5px] border-dashed border-line p-2">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
              Mientras tanto, en tu agenda
            </p>
            <Turno
              hora="15:00"
              nombre="Sofía Ramírez"
              servicio="Jueves 12, 15:00"
              sinHora
              estado={ya(t, 5600) ? "Confirmado" : "Sin confirmar"}
              clase={ya(t, 5600) ? CONFIRMADO : SIN_CONFIRMAR}
              resaltado={ya(t, 5600)}
            />
          </div>
        )}
      </div>
    ),
  },
  {
    clave: "mensajes",
    capitulo: "Mensajes",
    duracion: 7200,
    pantalla: "sistema",
    ruta: "dlay-agenda.vercel.app/mensajes",
    seccion: "Mensajes",
    hora: "Miércoles 15:52",
    relato:
      "Si alguien te escribe, suena y lo ves en Mensajes. Contestás desde ahí, sin agarrar el teléfono del negocio.",
    dibujar: (t) => {
      const abierta = ya(t, 2400);
      return (
        <div className="grid gap-2.5">
          {!abierta ? (
            <>
              <p className="text-[16px] font-bold tracking-[-0.02em]">Mensajes</p>
              {ya(t, 800) && (
                <div className="demo-aparece flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-accent bg-surface px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">Lu Ferreyra</span>
                    <span className="block truncate text-[12px] text-muted">
                      Hola! ¿Puedo llegar 10 minutos más tarde?
                    </span>
                  </span>
                  <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-accent px-1.5 text-[10.5px] font-semibold text-on-accent">
                    1
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-line bg-surface px-3 py-2.5 opacity-70">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">Carla Benítez</span>
                  <span className="block truncate text-[12px] text-muted">
                    Perfecto, gracias!
                  </span>
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold tracking-[-0.02em]">Lu Ferreyra</p>
              <Burbuja hora="15:52">Hola! ¿Puedo llegar 10 minutos más tarde?</Burbuja>
              {ya(t, 4600) && (
                <Burbuja propia hora="15:53">
                  Sí, tranqui. Te esperamos 16:10.
                </Burbuja>
              )}
              <div className="mt-1 flex items-center gap-2 rounded-[14px] border-[1.5px] border-line bg-surface px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                  {ya(t, 4600)
                    ? "Escribí una respuesta…"
                    : "Sí, tranqui. Te esperamos 16:10.".slice(
                        0,
                        Math.max(0, Math.floor((t - 2900) / 40)),
                      ) || "Escribí una respuesta…"}
                </span>
                <span className="rounded-pill bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-on-accent">
                  Enviar
                </span>
              </div>
              <p className="text-[11.5px] text-faint">
                Podés contestarle hasta mañana a las 15:52.
              </p>
            </>
          )}
        </div>
      );
    },
  },
  {
    clave: "ficha",
    capitulo: "Fichas",
    duracion: 6600,
    pantalla: "sistema",
    ruta: "dlay-agenda.vercel.app/clientes/sofia-ramirez",
    seccion: "Clientes",
    hora: "Jueves 14:55",
    relato:
      "Antes de que llegue, abrís su ficha: alergias, cuántas veces vino, cuánto gastó y lo que anotaste la última vez.",
    dibujar: (t) => (
      <div className="grid gap-2.5">
        <div>
          <p className="text-[17px] font-bold tracking-[-0.02em]">Sofía Ramírez</p>
          <p className="text-[12px] text-muted">+54 9 358 412-3456 · Cumple el 4 de mayo</p>
        </div>
        {ya(t, 600) && (
          <div className="demo-aparece rounded-[14px] bg-warn-wash px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-warn">
              Atención
            </p>
            <p className="text-[13px]">Alérgica al ácido glicólico.</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          <Dato etiqueta="Atendidos" valor={String(contar(14, t, 1300))} />
          <Dato etiqueta="Última vez" valor="3 sem." />
          <Dato
            etiqueta="Gastó"
            valor={formatPrice(contar(31200000, t, 1300))}
          />
        </div>
        {ya(t, 2800) && (
          <div className="demo-aparece flex flex-wrap gap-1.5">
            {["Facial", "Frecuente"].map((e) => (
              <span key={e} className="rounded-pill bg-accent-wash px-2.5 py-1 text-[11.5px] font-medium text-accent-text">
                {e}
              </span>
            ))}
          </div>
        )}
        {ya(t, 3700) && (
          <div className="demo-aparece rounded-[14px] bg-surface px-3 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">
              Seguimiento
            </p>
            <p className="text-[12.5px]">
              La piel reaccionó bien. Próxima: probar peeling suave.
            </p>
          </div>
        )}
      </div>
    ),
  },
  {
    clave: "caja",
    capitulo: "Caja",
    duracion: 7800,
    pantalla: "sistema",
    ruta: "dlay-agenda.vercel.app/caja",
    seccion: "Caja",
    hora: "Jueves 20:05",
    relato:
      "Cobrás con lo que te paguen y al final del día la caja te dice si cierra. Sin cuaderno ni calculadora.",
    dibujar: (t) =>
      !ya(t, 3600) ? (
        <div className="grid gap-2.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Cobrar turno
            </p>
            <p className="text-[16px] font-bold tracking-[-0.02em]">
              Sofía Ramírez · {formatPrice(2500000)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {["Efectivo", "Transferencia", "Débito", "Crédito", "Mercado Pago", "Otro"].map(
              (m) => (
                <Opcion
                  key={m}
                  texto={m}
                  elegida={m === "Mercado Pago" && ya(t, 1400)}
                  tocando={m === "Mercado Pago" && ya(t, 1100) && !ya(t, 1600)}
                  className="truncate text-center text-[11.5px]"
                />
              ),
            )}
          </div>
          {ya(t, 2300) && (
            <div className="demo-aparece flex items-center justify-between rounded-[14px] bg-ok-wash px-3 py-2.5">
              <span className="text-[13px] font-semibold text-ok">Cobrado</span>
              <span className="text-[13px] tabular-nums text-ok">
                + {formatPrice(2500000)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="demo-aparece grid gap-2.5">
          <p className="text-[16px] font-bold tracking-[-0.02em]">
            Cierre del día
          </p>
          <div className="grid gap-1.5">
            {[
              ["Debería haber en efectivo", formatPrice(6160000)],
              ["Se contó", formatPrice(contar(6160000, t, 4300))],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between rounded-[12px] bg-surface px-3 py-2 text-[13px]">
                <span className="text-muted">{k}</span>
                <span className="tabular-nums">{v}</span>
              </div>
            ))}
          </div>
          {ya(t, 5700) && (
            <div className="demo-aparece flex items-center justify-between rounded-[14px] bg-accent px-3 py-3 text-on-accent">
              <span className="text-[13.5px] font-medium">Diferencia</span>
              <span className="font-hand text-[26px] leading-none">
                {formatPrice(0)}, cierra
              </span>
            </div>
          )}
        </div>
      ),
  },
  {
    clave: "informes",
    capitulo: "Informes",
    duracion: 7400,
    pantalla: "sistema",
    ruta: "dlay-agenda.vercel.app/informes",
    seccion: "Informes",
    hora: "1 de octubre",
    relato:
      "A fin de mes sabés cuánto entró, qué tan llena estuvo la agenda y cuántos faltaron.",
    dibujar: (t) => {
      const medios: [string, number][] = [
        ["Efectivo", 46],
        ["Transferencia", 31],
        ["Mercado Pago", 17],
        ["Débito", 6],
      ];
      return (
        <div className="grid gap-2.5">
          <p className="text-[16px] font-bold tracking-[-0.02em]">Septiembre</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Dato etiqueta="Cobrado" valor={formatPrice(contar(128400000, t, 400, 1600))} acento />
            <Dato etiqueta="Ocupación" valor={`${contar(78, t, 400, 1600)} %`} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Dato etiqueta="Atendidos" valor={String(contar(162, t, 1800))} />
            <Dato etiqueta="No vinieron" valor={String(contar(4, t, 1800))} />
            <Dato etiqueta="Cancelados" valor={String(contar(11, t, 1800))} />
          </div>
          <div className="grid gap-1.5 rounded-[14px] bg-surface px-3 py-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">
              Por medio de pago
            </p>
            {medios.map(([m, pct], i) => (
              <div key={m} className="grid grid-cols-[92px_minmax(0,1fr)_34px] items-center gap-2 text-[11.5px]">
                <span className="truncate text-muted">{m}</span>
                <span className="h-2 overflow-hidden rounded-pill bg-surface-2">
                  <span
                    className="block h-full rounded-pill bg-accent transition-[width] duration-700 ease-out"
                    style={{ width: ya(t, 3000 + i * 250) ? `${pct}%` : "0%" }}
                  />
                </span>
                <span className="text-right tabular-nums text-muted">{pct} %</span>
              </div>
            ))}
          </div>
        </div>
      );
    },
  },
  {
    clave: "equipo",
    capitulo: "Equipo",
    duracion: 6000,
    pantalla: "sistema",
    ruta: "dlay-agenda.vercel.app/configuracion/equipo",
    seccion: "Ajustes",
    hora: "Viernes 9:00",
    relato:
      "Sumás a tu equipo con un enlace, y cada persona ve sólo lo que le toca.",
    dibujar: (t) => (
      <div className="grid gap-2">
        <p className="text-[16px] font-bold tracking-[-0.02em]">Tu equipo</p>
        {[
          ["Ana Gómez", "Titular", "Todo, incluida la cuenta de Dlay."],
          ["Belén Torres", "Recepción", "Agenda, clientes y caja. No toca precios ni configuración."],
          ["Lucía Paz", "Profesional", "Su agenda y las fichas. No ve la caja ni la cuenta."],
        ].map(([nombre, rol, ve], i) =>
          ya(t, 500 + i * 900) ? (
            <div key={nombre} className="demo-aparece rounded-[14px] border-[1.5px] border-line bg-surface px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-semibold">{nombre}</p>
                <Pastilla texto={rol} clase={i === 0 ? "bg-accent text-on-accent" : "bg-accent-wash text-accent-text"} />
              </div>
              <p className="mt-0.5 text-[12px] text-muted">{ve}</p>
            </div>
          ) : null,
        )}
        {ya(t, 3500) && (
          <p className="demo-aparece text-[12px] text-faint">
            Y la agenda se usa desde la computadora del local o desde el
            celular de cada uno, como una aplicación más.
          </p>
        )}
      </div>
    ),
  },
  {
    clave: "cierre",
    capitulo: "Precio",
    duracion: 5200,
    pantalla: "cierre",
    hora: "",
    relato:
      "Y lo que no entra en un minuto: tus clientes se importan desde un Excel y te llevás tus datos cuando quieras.",
    dibujar: () => (
      <div className="grid h-full content-center justify-items-center gap-4 text-center">
        <p className="font-hand text-[40px] leading-none text-accent-text sm:text-[48px]">
          Todo esto
        </p>
        <p className="max-w-[22ch] text-[22px] font-bold leading-tight tracking-[-0.03em] sm:text-[26px]">
          {formatPrice(ABONO_MENSUAL_CENTS)} por mes. El primero, gratis.
        </p>
        <Link
          href="/entrar"
          className="rounded-pill bg-accent px-5 py-2.5 text-[14.5px] font-semibold text-on-accent hover:opacity-90"
        >
          Crear mi cuenta
        </Link>
      </div>
    ),
  },
];

const SECCIONES = ["Agenda", "Clientes", "Caja", "Informes", "Mensajes", "Ajustes"];

// ---------------------------------------------------------------------------
// El reproductor
// ---------------------------------------------------------------------------

type Reloj = { escena: number; t: number };
type Paso =
  | { tipo: "avanzar"; ms: number }
  | { tipo: "ir"; escena: number; t: number };

function reloj(estado: Reloj, paso: Paso): Reloj {
  if (paso.tipo === "ir") return { escena: paso.escena, t: paso.t };
  const t = estado.t + paso.ms;
  if (t < ESCENAS[estado.escena].duracion) return { ...estado, t };
  return { escena: (estado.escena + 1) % ESCENAS.length, t: 0 };
}

function Marco({ escena, children }: { escena: Escena; children: ReactNode }) {
  if (escena.pantalla === "telefono") {
    return (
      <div className="mx-auto h-full w-full max-w-[19rem] rounded-[30px] border-[1.5px] border-line bg-surface p-2">
        <div className="flex h-full flex-col overflow-hidden rounded-[22px] bg-surface-2">
          <div className="flex items-center justify-between px-4 pb-1 pt-2 text-[10.5px] font-semibold tabular-nums text-faint">
            <span>{escena.hora.split(" ").pop()}</span>
            <span>{escena.ruta ? "Navegador" : "WhatsApp"}</span>
          </div>
          {escena.ruta && (
            <p className="mx-3 mb-1 truncate rounded-pill bg-surface px-3 py-1 text-center text-[10.5px] text-faint">
              {escena.ruta}
            </p>
          )}
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden p-3 ${
              escena.chat ? "justify-end" : ""
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  if (escena.pantalla === "cierre") {
    return (
      <div className="h-full rounded-card border-[1.5px] border-accent bg-surface p-6">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card border-[1.5px] border-line bg-surface-2">
      <div className="flex items-center gap-3 border-b-[1.5px] border-line bg-surface px-3 py-2">
        <p className="min-w-0 flex-1 truncate rounded-pill bg-surface-2 px-3 py-1 text-[10.5px] text-faint">
          {escena.ruta}
        </p>
      </div>
      <nav
        aria-hidden
        className="flex gap-1 overflow-hidden border-b-[1.5px] border-line-soft bg-surface px-3 py-1.5"
      >
        {SECCIONES.map((s) => (
          <span
            key={s}
            className={`relative shrink-0 rounded-pill px-2.5 py-1 text-[11.5px] font-medium ${
              s === escena.seccion ? "bg-accent text-on-accent" : "text-muted"
            }`}
          >
            {s}
            {s === "Mensajes" && escena.clave === "mensajes" && (
              <span className="ml-1 rounded-pill bg-danger px-1.5 text-[9.5px] text-surface">
                1
              </span>
            )}
          </span>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-hidden p-3.5 sm:p-4">
        {children}
      </div>
    </div>
  );
}

export function DemoAutomatica() {
  const [estado, mover] = useReducer(reloj, { escena: 0, t: 0 });
  const [pausada, setPausada] = useState(false);
  const [quieta, setQuieta] = useState(false);
  const [enPantalla, setEnPantalla] = useState(true);
  const [pestanaVisible, setPestanaVisible] = useState(true);
  const caja = useRef<HTMLDivElement>(null);

  // Quien pidió menos movimiento la ve quieta: cada escena en su estado final
  // y se pasa con los capítulos.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => {
      setQuieta(mq.matches);
      if (mq.matches) {
        mover({ tipo: "ir", escena: 0, t: ESCENAS[0].duracion - 1 });
      }
    };
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  // Fuera de la vista o con la pestaña escondida no corre: así, al volver, la
  // persona la encuentra donde la dejó y no en una escena cualquiera.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setEnPantalla(e.isIntersecting),
      { threshold: 0.35 },
    );
    io.observe(el);
    const alCambiar = () => setPestanaVisible(!document.hidden);
    document.addEventListener("visibilitychange", alCambiar);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", alCambiar);
    };
  }, []);

  const corre = !pausada && !quieta && enPantalla && pestanaVisible;

  useEffect(() => {
    if (!corre) return;
    let antes = performance.now();
    const id = setInterval(() => {
      const ahora = performance.now();
      mover({ tipo: "avanzar", ms: ahora - antes });
      antes = ahora;
    }, 80);
    return () => clearInterval(id);
  }, [corre]);

  const escena = ESCENAS[estado.escena];

  function irA(i: number) {
    mover({ tipo: "ir", escena: i, t: quieta ? ESCENAS[i].duracion - 1 : 0 });
  }

  return (
    <div ref={caja} className="grid min-w-0 gap-3">
      {/* Los capítulos: avanzan solos y también sirven para saltar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (quieta ? irA((estado.escena + 1) % ESCENAS.length) : setPausada((p) => !p))}
          aria-label={quieta ? "Siguiente escena" : pausada ? "Seguir" : "Pausar"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-surface text-ink hover:border-accent"
        >
          {quieta ? (
            <span aria-hidden className="text-[13px]">→</span>
          ) : pausada ? (
            <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 fill-current">
              <path d="M3 1.5v9l7-4.5z" />
            </svg>
          ) : (
            <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 fill-current">
              <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" />
            </svg>
          )}
        </button>
        <div className="grid flex-1 grid-flow-col gap-1">
          {ESCENAS.map((e, i) => (
            <button
              key={e.clave}
              type="button"
              onClick={() => irA(i)}
              aria-label={`Ver ${e.capitulo}`}
              aria-current={i === estado.escena}
              className="group grid gap-1 py-1 text-left"
            >
              <span className="h-1 overflow-hidden rounded-pill bg-line">
                <span
                  className="block h-full rounded-pill bg-accent"
                  style={{
                    width:
                      i < estado.escena
                        ? "100%"
                        : i === estado.escena
                          ? `${Math.min(100, (estado.t / e.duracion) * 100)}%`
                          : "0%",
                  }}
                />
              </span>
              <span
                className={`hidden truncate text-[11px] lg:block ${
                  i === estado.escena ? "font-semibold text-ink" : "text-faint group-hover:text-muted"
                }`}
              >
                {e.capitulo}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-card border-[1.5px] border-line bg-paper p-3 sm:p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:items-center lg:gap-8">
        <div key={escena.clave} className="demo-aparece h-[27rem] min-w-0 sm:h-[25rem]">
          <Marco escena={escena}>{escena.dibujar(estado.t)}</Marco>
        </div>

        <div className="grid min-w-0 content-center gap-2 lg:order-first">
          {escena.hora && (
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
              {escena.hora} · {escena.capitulo}
            </p>
          )}
          <p
            key={escena.clave}
            aria-live="polite"
            className="demo-aparece font-hand text-[26px] leading-snug text-accent-text sm:text-[30px]"
          >
            {escena.relato}
          </p>
        </div>
      </div>
    </div>
  );
}
