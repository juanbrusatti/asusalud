import { describe, expect, it } from "vitest";
import { paraMeta } from "../../supabase/functions/_shared/plantillas";

/**
 * Nuestro cuerpo se escribe con huecos con nombre —{{cliente}}— porque una
 * persona tiene que poder leer la plantilla. Meta los numera: {{1}}, {{2}}.
 *
 * El orden importa más de lo que parece: el emisor manda los parámetros en el
 * orden en que aparecen en NUESTRO cuerpo. Si la conversión se desalinea, el
 * cliente recibe la hora en el lugar del nombre y nadie se entera hasta que
 * alguien lo lee.
 */

const CUERPO =
  "Hola {{cliente}}! Te recordamos tu turno en {{estetica}} mañana " +
  "{{fecha}} a las {{hora}} para {{servicio}}. {{preparacion}}";

describe("el cuerpo que se manda a Meta", () => {
  it("numera los huecos en el orden en que aparecen", () => {
    const { texto } = paraMeta(CUERPO);

    expect(texto).toBe(
      "Hola {{1}}! Te recordamos tu turno en {{2}} mañana " +
        "{{3}} a las {{4}} para {{5}}. {{6}}",
    );
  });

  it("da un ejemplo por hueco, en el mismo orden", () => {
    const { ejemplos } = paraMeta(CUERPO);

    // Meta rechaza la plantilla si falta algún ejemplo.
    expect(ejemplos).toHaveLength(6);
    expect(ejemplos[0]).toBe("Mirián");
    expect(ejemplos[3]).toBe("09:00");
  });

  it("no deja ningún hueco con nombre sin convertir", () => {
    const { texto } = paraMeta(CUERPO);
    expect(texto).not.toMatch(/\{\{[a-z]/i);
  });

  it("un cuerpo sin huecos no lleva ejemplos", () => {
    const { texto, ejemplos } = paraMeta("Te esperamos mañana.");
    expect(texto).toBe("Te esperamos mañana.");
    expect(ejemplos).toHaveLength(0);
  });

  it("el mismo hueco dos veces cuenta dos veces", () => {
    // Meta numera por aparición, no por nombre: repetir {{cliente}} son dos
    // parámetros distintos y los dos hay que mandarlos.
    const { texto, ejemplos } = paraMeta("{{cliente}}, gracias {{cliente}}");
    expect(texto).toBe("{{1}}, gracias {{2}}");
    expect(ejemplos).toHaveLength(2);
  });
});
