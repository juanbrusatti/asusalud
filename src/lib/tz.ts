/**
 * Aritmética de fechas en la zona horaria del negocio.
 *
 * Una agenda se rompe siempre por el mismo lado: el servidor calcula "hoy" en
 * UTC, el turno de las 21:30 de Río Cuarto cae en el día siguiente y aparece
 * en la pantalla equivocada. Todo lo que sea "qué día es" pasa por acá.
 *
 * Se apoya en Intl, que ya conoce las reglas de cada zona (incluido el horario
 * de verano, que Argentina hoy no usa pero otras provincias y países sí).
 */

/** Minutos que la zona lleva de diferencia con UTC en ese instante. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(instant);

  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;

  const [, sign, hours, minutes = "0"] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -total : total;
}

/**
 * Convierte una hora local ("2026-09-14T09:00:00") al instante real en UTC.
 *
 * Se calcula dos veces a propósito: la primera estimación puede caer del lado
 * equivocado de un cambio de horario, y la segunda lo corrige.
 */
export function zonedTimeToUtc(local: string, timeZone: string): Date {
  const naive = Date.parse(`${local}Z`);
  const first = offsetMinutes(new Date(naive), timeZone);
  const candidate = new Date(naive - first * 60_000);
  const second = offsetMinutes(candidate, timeZone);

  return second === first
    ? candidate
    : new Date(naive - second * 60_000);
}

/** Principio y fin de un día local, como instantes UTC. */
export function zonedDayRange(
  date: string,
  timeZone: string,
): { from: Date; to: Date } {
  return {
    from: zonedTimeToUtc(`${date}T00:00:00`, timeZone),
    to: zonedTimeToUtc(`${nextDay(date)}T00:00:00`, timeZone),
  };
}

/** "2026-09-14" → "2026-09-15". Sin zonas: es aritmética de calendario. */
export function nextDay(date: string, days = 1): string {
  const [y, m, d] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return moved.toISOString().slice(0, 10);
}

/** Qué día es hoy en el negocio, como "2026-09-14". */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** La hora del turno tal como se lee en el negocio: "09:30". */
export function timeIn(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
}

/** "lun 14 de septiembre" */
export function longDateIn(date: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(zonedTimeToUtc(`${date}T12:00:00`, timeZone));
}

/** Los siete días de la semana que contiene a `date`, de lunes a domingo. */
export function weekOf(date: string): string[] {
  const [y, m, d] = date.split("-").map(Number);
  const ref = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 0 es domingo. Se corre para que la semana arranque el lunes.
  const offset = (ref.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => nextDay(date, i - offset));
}
