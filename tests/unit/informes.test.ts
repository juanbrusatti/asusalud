import { describe, expect, it } from "vitest";
import { describeRange, resolveRange, share } from "@/lib/informes";

/**
 * Los períodos se calculan a partir del día de la estética, no del reloj del
 * servidor. En Vercel el proceso corre en UTC: a las 21:30 de Río Cuarto allá
 * ya es mañana, y "este mes" saltaría un día antes de tiempo.
 */

describe("resolveRange", () => {
  it("este mes va del día 1 a hoy", () => {
    expect(resolveRange({}, "2026-09-12")).toEqual({
      from: "2026-09-01",
      to: "2026-09-12",
      preset: "mes",
    });
  });

  it("el mes pasado va completo, de punta a punta", () => {
    expect(resolveRange({ preset: "mes-pasado" }, "2026-09-12")).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
      preset: "mes-pasado",
    });
  });

  it("el mes pasado de enero es diciembre del año anterior", () => {
    expect(resolveRange({ preset: "mes-pasado" }, "2026-01-09")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
      preset: "mes-pasado",
    });
  });

  it("acierta el último día de febrero en un año bisiesto", () => {
    expect(resolveRange({ preset: "mes-pasado" }, "2028-03-10")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
      preset: "mes-pasado",
    });
  });

  it("los últimos 30 días incluyen hoy", () => {
    // Del 14 de agosto al 12 de septiembre son 30 días contando los dos.
    expect(resolveRange({ preset: "30-dias" }, "2026-09-12")).toEqual({
      from: "2026-08-14",
      to: "2026-09-12",
      preset: "30-dias",
    });
  });

  it("un rango escrito a mano gana sobre el atajo", () => {
    expect(
      resolveRange(
        { preset: "mes", desde: "2026-07-01", hasta: "2026-07-15" },
        "2026-09-12",
      ),
    ).toEqual({ from: "2026-07-01", to: "2026-07-15", preset: null });
  });

  it("un rango al revés se endereza en lugar de romperse", () => {
    // La base lo rechazaría; mejor mostrar un día que una pantalla de error.
    expect(
      resolveRange({ desde: "2026-07-10", hasta: "2026-07-01" }, "2026-09-12"),
    ).toEqual({ from: "2026-07-10", to: "2026-07-10", preset: null });
  });

  it("cualquier cosa en la dirección cae en este mes", () => {
    expect(resolveRange({ preset: "hola", desde: "ayer" }, "2026-09-12")).toEqual(
      { from: "2026-09-01", to: "2026-09-12", preset: "mes" },
    );
  });
});

describe("describeRange", () => {
  it("no repite el mes cuando es el mismo", () => {
    expect(
      describeRange({ from: "2026-09-01", to: "2026-09-12", preset: "mes" }),
    ).toBe("Del 1 al 12 de septiembre");
  });

  it("nombra los dos meses cuando el período los cruza", () => {
    expect(
      describeRange({ from: "2026-08-14", to: "2026-09-12", preset: "30-dias" }),
    ).toBe("Del 14 de agosto al 12 de septiembre");
  });

  it("agrega el año cuando el período cambia de año", () => {
    expect(
      describeRange({ from: "2025-12-20", to: "2026-01-05", preset: null }),
    ).toBe("Del 20 de diciembre al 5 de enero de 2026");
  });

  it("un solo día se dice como un solo día", () => {
    expect(
      describeRange({ from: "2026-09-12", to: "2026-09-12", preset: null }),
    ).toBe("El 12 de septiembre de 2026");
  });
});

describe("share", () => {
  it("redondea a entero", () => {
    expect(share(1, 3)).toBe(33);
    expect(share(2, 3)).toBe(67);
  });

  it("sin total no hay porcentaje que inventar", () => {
    expect(share(0, 0)).toBeNull();
  });
});
