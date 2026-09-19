"use client";

/**
 * Dos sonidos cortos para lo que pasa sin que nadie lo toque.
 *
 * Se sintetizan en el momento en lugar de cargar archivos: son dos notas, y
 * dos notas pesan menos escritas que grabadas. De paso no hay que servir nada
 * ni esperar a que baje justo cuando tiene que sonar.
 *
 * Suben o bajan a propósito. Que confirmen es una buena noticia y termina
 * arriba; que cancelen no lo es y termina abajo. Se distinguen sin mirar la
 * pantalla, que es todo el punto.
 */

let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    contexto ??= new window.AudioContext();
    // El navegador lo deja dormido hasta que alguien toca algo en la página.
    // Quien está mirando la agenda ya tocó media docena de cosas, así que
    // despierta; si no, esto no suena y tampoco rompe nada.
    if (contexto.state === "suspended") void contexto.resume().catch(() => {});
    return contexto;
  } catch {
    // Navegador sin audio, o con el audio bloqueado. Es un adorno: se calla.
    return null;
  }
}

/** Una nota con entrada y salida suaves; sin eso se escucha un chasquido. */
function nota(
  ctx: AudioContext,
  frecuencia: number,
  demora: number,
  duracion: number,
) {
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = frecuencia;

  const t = ctx.currentTime + demora;
  vol.gain.setValueAtTime(0, t);
  vol.gain.linearRampToValueAtTime(0.12, t + 0.015);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + duracion);

  osc.connect(vol).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duracion + 0.02);
}

function tocar(notas: Array<[frecuencia: number, demora: number]>) {
  const ctx = obtenerContexto();
  if (!ctx) return;
  try {
    for (const [frecuencia, demora] of notas) nota(ctx, frecuencia, demora, 0.18);
  } catch {
    // Si el navegador se queda sin osciladores, que no se lleve la página.
  }
}

/** Alguien confirmó su turno. Dos notas que suben. */
export function sonarConfirmado() {
  tocar([
    [659.25, 0], // mi
    [987.77, 0.09], // si
  ]);
}

/** Alguien avisó que no viene. Dos notas que bajan. */
export function sonarCancelado() {
  tocar([
    [493.88, 0], // si
    [329.63, 0.1], // mi, una octava abajo
  ]);
}
