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
  preparation: "No te depiles con cera 15 días antes.",
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

  it("usa la hora del negocio y no la del servidor", () => {
    // Las 12:00 UTC son las 09:00 en Córdoba. Si esto se rompe, al cliente
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

describe("las indicaciones de cada servicio", () => {
  it("entran en el mensaje por su hueco", () => {
    const texto = render(
      "Mañana a las {{hora}} para {{servicio}}. {{preparacion}}",
      CTX,
    );
    expect(texto).toContain("No te depiles con cera 15 días antes.");
  });

  it("un servicio sin indicaciones no deja el hueco a la vista", () => {
    const texto = render(
      "Mañana a las {{hora}} para {{servicio}}. {{preparacion}}",
      { ...CTX, preparation: null },
    );
    expect(texto).not.toContain("{{");
    // Ni un espacio de más antes del punto, ni dos seguidos.
    expect(texto).not.toMatch(/ {2,}/);
    expect(texto.endsWith(".")).toBe(true);
  });

  it("en WhatsApp ningún parámetro puede ir vacío", () => {
    const parametros = templateParameters(
      "Hola {{cliente}}, {{servicio}} el {{fecha}}. {{preparacion}}",
      { ...CTX, preparation: null, serviceNames: null },
    );

    // Meta rechaza el mensaje entero si falta un valor: la plantilla aprobada
    // espera N parámetros y cada uno tiene que traer algo.
    expect(parametros).toHaveLength(4);
    for (const p of parametros) {
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("fecha y hora en un solo hueco", () => {
  it("{{cuando}} las junta", () => {
    const texto = render("Te esperamos el {{cuando}}.", CTX);

    // No es azúcar: Meta rechaza las plantillas con muchas variables para el
    // largo del texto, y juntar estas dos saca una sin perder nada.
    expect(texto).toContain("a las");
    expect(texto).toMatch(/Te esperamos el .+ a las \d{2}:\d{2}\./);
  });

  it("sin turno no deja el hueco a la vista", () => {
    const texto = render("Te esperamos el {{cuando}}.", {
      ...CTX,
      appointmentAt: null,
    });
    expect(texto).not.toContain("{{");
  });
});

describe("el mensaje que escribe cada servicio", () => {
  it("puede usar los huecos del turno adentro", () => {
    // Es la razón de ser del cambio: la dueña escribe el mensaje entero en la
    // pantalla del servicio, sin pasar por Recordatorios.
    const texto = render("Che, {{mensaje}}", {
      ...CTX,
      preparation: "{{cliente}}, te esperamos el {{cuando}} para {{servicio}}.",
    });

    expect(texto).toBe(
      "Che, Mirián, te esperamos el lunes, 14 de septiembre a las 09:00 " +
        "para Depilación Definitiva.",
    );
  });

  it("no se expande a sí mismo", () => {
    // Dos pasadas y no tres: sin esto, un {{mensaje}} adentro del mensaje
    // sería una recursión que cuelga al emisor.
    const texto = render("{{mensaje}}", {
      ...CTX,
      preparation: "Antes de {{mensaje}} venir",
    });
    expect(texto).toBe("Antes de venir");
  });

  it("sigue respondiendo al nombre viejo del hueco", () => {
    // Hay plantillas aprobadas en Meta que dicen {{preparacion}}. Cambiarles
    // el nombre a mano las manda de vuelta a la cola de aprobación.
    const ctx = { ...CTX, preparation: "Vení sin cremas." };
    expect(render("{{preparacion}}", ctx)).toBe(render("{{mensaje}}", ctx));
  });

  it("aplana los renglones antes de mandárselos a Meta", () => {
    // Un parámetro con saltos de línea, tabulaciones o cuatro espacios
    // seguidos hace que Meta rechace el envío entero. Quien escribe el
    // mensaje en un cuadro de tres renglones va a apretar Enter tarde o
    // temprano, y ese Enter no puede costar el recordatorio.
    const [parametro] = templateParameters("Hola. {{mensaje}}", {
      ...CTX,
      preparation: "Traé toalla.\n\nY vení sin cremas.\tGracias.",
    });

    expect(parametro).toBe("Traé toalla. Y vení sin cremas. Gracias.");
    expect(parametro).not.toMatch(/[\n\r\t]/);
    expect(parametro).not.toMatch(/ {4,}/);
  });

  it("no rompe el texto de los canales que sí admiten renglones", () => {
    // El aplanado es sólo para los parámetros de Meta. Si mañana vuelve el
    // correo, sus saltos de línea tienen que seguir llegando.
    const texto = render("{{mensaje}}", {
      ...CTX,
      preparation: "Traé toalla.\nY vení sin cremas.",
    });
    expect(texto).toBe("Traé toalla.\nY vení sin cremas.");
  });
});

describe("el recordatorio completo que sale a Meta", () => {
  // El cuerpo tal como queda en la plantilla de fábrica.
  const PLANTILLA =
    "Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte tu " +
    "turno de mañana {{cuando}}, para {{servicio}}. {{mensaje}} " +
    "Con los botones de acá abajo podés confirmar el turno o avisarnos " +
    "que no vas a venir. ¡Te esperamos!";

  // El más largo de los que la estética venía mandando.
  const CUTIS =
    "Tu turno es reservado especialmente para vos 💕 Si no asistís o " +
    "cancelás el mismo día, el turno se abona igual, porque ese espacio " +
    "queda reservado para vos. No pedimos seña previa. De lo contrario, en " +
    "la próxima sesión se abona el turno no asistido más el nuevo, sin " +
    "excepción. ALIAS: asusalud25 — Morlhiere Jesica Jorgelina — Naranja X. " +
    "Gracias por valorar nuestro tiempo y organización 🌿";

  it("entra en el tope de 1024 caracteres de Meta", () => {
    // Con el peor caso real: el mensaje más largo y un turno de dos
    // servicios de nombre largo. Pasado ese tope Meta corta el mensaje.
    const texto = render(PLANTILLA, {
      ...CTX,
      serviceNames:
        "Limpieza de Cutis c/ extracción o aparatología + Depilación Definitiva",
      preparation: CUTIS,
    });

    expect(texto.length).toBeLessThanOrEqual(1024);
    expect(texto).not.toContain("{{");
  });

  it("ni empieza ni termina en un hueco", () => {
    // Las dos formas en que Meta rechaza una plantilla por su forma.
    expect(PLANTILLA.trim()).not.toMatch(/^\{\{/);
    expect(PLANTILLA.trim()).not.toMatch(/\}\}$/);
  });

  it("manda cinco parámetros, todos con algo adentro", () => {
    const p = templateParameters(PLANTILLA, { ...CTX, preparation: CUTIS });
    expect(p).toHaveLength(5);
    for (const v of p) {
      expect(v.trim().length).toBeGreaterThan(0);
      expect(v).not.toMatch(/[\n\r\t]/);
    }
  });
});
