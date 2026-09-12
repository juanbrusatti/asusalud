import { describe, expect, it } from "vitest";
import {
  render,
  templateParameters,
} from "../../supabase/functions/_shared/render";

const CTX = {
  clientName: "Mirián Ortiz",
  tenantName: "Estética Asusalud",
  tenantTimezone: "America/Argentina/Cordoba",
  // Lunes 14 de septiembre a las 09:00 de Córdoba.
  appointmentAt: "2026-09-14T12:00:00.000Z",
  serviceNames: "Depilación Definitiva",
  manageUrl: "https://dlay.app/t/abc123",
};

describe("armado del mensaje", () => {
  it("reemplaza los huecos por los datos reales", () => {
    const texto = render(
      "Hola {{cliente}}, te esperamos el {{fecha}} a las {{hora}} para tu {{servicio}}.",
      CTX,
    );

    // Sólo el nombre de pila: "Hola Mirián Ortiz" suena a carta del banco.
    expect(texto).toContain("Hola Mirián,");
    expect(texto).toContain("lunes");
    expect(texto).toContain("14 de septiembre");
    expect(texto).toContain("09:00");
    expect(texto).toContain("Depilación Definitiva");
  });

  it("usa la hora de la estética y no la del servidor", () => {
    // Las 12:00 UTC son las 09:00 en Córdoba. Si esto se rompe, a la clienta
    // le llega el horario equivocado.
    expect(render("{{hora}}", CTX)).toBe("09:00");
  });

  it("tolera los espacios dentro de los huecos", () => {
    expect(render("Hola {{ cliente }}", CTX)).toBe("Hola Mirián");
  });

  it("no le manda a nadie un hueco sin completar", () => {
    const texto = render("Hola {{cliente}}, tu {{inventado}} está listo.", CTX);
    expect(texto).not.toContain("{{");
    expect(texto).toBe("Hola Mirián, tu está listo.");
  });

  it("limpia los espacios que deja un dato faltante", () => {
    const sinServicio = { ...CTX, serviceNames: null };
    const texto = render("Te esperamos para tu {{servicio}} .", sinServicio);
    // Ni doble espacio ni un espacio colgando antes del punto.
    expect(texto).not.toMatch(/ {2}/);
    expect(texto).toBe("Te esperamos para tu.");
  });

  it("aguanta un turno sin fecha", () => {
    const suelto = { ...CTX, appointmentAt: null };
    expect(render("El {{fecha}} a las {{hora}}", suelto)).toBe("El a las");
  });
});

describe("parámetros para WhatsApp", () => {
  it("los devuelve en el orden en que aparecen en el texto", () => {
    // Meta no recibe el texto: recibe la plantilla aprobada más sus parámetros
    // numerados. Si el orden no coincide, el mensaje llega con los datos
    // cambiados de lugar.
    expect(
      templateParameters(
        "Hola {{cliente}}, el {{fecha}} a las {{hora}}.",
        CTX,
      ),
    ).toEqual(["Mirián", "lunes, 14 de septiembre", "09:00"]);
  });

  it("respeta un orden distinto al habitual", () => {
    expect(
      templateParameters("{{hora}} del {{fecha}}, {{cliente}}", CTX),
    ).toEqual(["09:00", "lunes, 14 de septiembre", "Mirián"]);
  });

  it("devuelve vacío cuando la plantilla no tiene huecos", () => {
    expect(templateParameters("Te esperamos mañana.", CTX)).toEqual([]);
  });
});

describe("el enlace del turno", () => {
  it("reemplaza {{link}} por la dirección del turno", () => {
    expect(render("Cambialo acá: {{link}}", CTX)).toBe(
      "Cambialo acá: https://dlay.app/t/abc123",
    );
  });

  it("un turno sin enlace no deja el hueco a la vista", () => {
    // Pasa con los avisos que no cuelgan de un turno, como un cumpleaños.
    const sinTurno = { ...CTX, manageUrl: null };
    expect(render("Escribinos. {{link}}", sinTurno)).toBe("Escribinos.");
  });

  it("el enlace viaja como parámetro en las plantillas de WhatsApp", () => {
    expect(templateParameters("Hola {{cliente}}: {{link}}", CTX)).toEqual([
      "Mirián",
      "https://dlay.app/t/abc123",
    ]);
  });
});
