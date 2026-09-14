import { describe, expect, it } from "vitest";
import {
  longDateIn,
  nextDay,
  timeIn,
  weekOf,
  zonedDayRange,
  zonedTimeToUtc,
} from "@/lib/tz";

const CORDOBA = "America/Argentina/Cordoba"; // UTC-3 todo el año
const MADRID = "Europe/Madrid"; // UTC+1 / UTC+2 según la época

describe("hora local a instante real", () => {
  it("convierte una hora de Córdoba a UTC", () => {
    // Las 09:00 en Córdoba son las 12:00 UTC.
    expect(zonedTimeToUtc("2026-09-14T09:00:00", CORDOBA).toISOString()).toBe(
      "2026-09-14T12:00:00.000Z",
    );
  });

  it("respeta el horario de verano donde existe", () => {
    // Madrid en enero es UTC+1; en julio, UTC+2.
    expect(zonedTimeToUtc("2026-01-15T09:00:00", MADRID).toISOString()).toBe(
      "2026-01-15T08:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-07-15T09:00:00", MADRID).toISOString()).toBe(
      "2026-07-15T07:00:00.000Z",
    );
  });
});

describe("el día del negocio", () => {
  it("empieza y termina cuando corresponde, no en UTC", () => {
    const { from, to } = zonedDayRange("2026-09-14", CORDOBA);
    expect(from.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-15T03:00:00.000Z");
  });

  it("un turno de la noche cae en el día correcto", () => {
    // Las 21:30 de Córdoba son las 00:30 UTC del día siguiente. Sin esto, el
    // turno aparecería en la pantalla de mañana.
    const turno = zonedTimeToUtc("2026-09-14T21:30:00", CORDOBA);
    expect(turno.toISOString()).toBe("2026-09-15T00:30:00.000Z");

    const { from, to } = zonedDayRange("2026-09-14", CORDOBA);
    expect(turno >= from && turno < to).toBe(true);
  });

  it("muestra la hora como se lee en el negocio", () => {
    expect(timeIn("2026-09-15T00:30:00.000Z", CORDOBA)).toBe("21:30");
  });
});

describe("calendario", () => {
  it("avanza días cruzando fin de mes y año", () => {
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("arma la semana de lunes a domingo", () => {
    // El 14/09/2026 es lunes.
    expect(weekOf("2026-09-14")[0]).toBe("2026-09-14");
    expect(weekOf("2026-09-14")[6]).toBe("2026-09-20");
    // Un domingo pertenece a la semana que empezó el lunes anterior.
    expect(weekOf("2026-09-20")[0]).toBe("2026-09-14");
  });

  it("escribe la fecha en castellano", () => {
    expect(longDateIn("2026-09-14", CORDOBA)).toMatch(/14 de septiembre/);
  });
});
