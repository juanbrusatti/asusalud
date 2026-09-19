import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, expectRejected } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;

const TELEFONO_A = "5493584111111";
const TELEFONO_B = "5493584222222";

beforeAll(async () => {
  s = await setupScenario("bdj");

  await asAdmin(async (c) => {
    // Una clienta de A escribió recién: su ventana está abierta.
    await c.query(
      `insert into public.whatsapp_inbound
         (tenant_id, wa_message_id, from_phone, kind, body, received_at)
       values ($1, 'wamid.bdj.a', $2, 'text', 'Hola, puedo llevar a mi hermana?', now())`,
      [s.tenantA, TELEFONO_A],
    );

    // Otra escribió hace dos días: la de ella ya cerró.
    await c.query(
      `insert into public.whatsapp_inbound
         (tenant_id, wa_message_id, from_phone, kind, body, received_at)
       values ($1, 'wamid.bdj.vieja', $2, 'text', 'Consulta vieja',
               now() - interval '2 days')`,
      [s.tenantA, "5493584333333"],
    );

    // Y algo del negocio B, que A no tiene por qué ver nunca.
    await c.query(
      `insert into public.whatsapp_inbound
         (tenant_id, wa_message_id, from_phone, kind, body)
       values ($1, 'wamid.bdj.b', $2, 'text', 'Mensaje del otro negocio')`,
      [s.tenantB, TELEFONO_B],
    );
  });
});

afterAll(async () => {
  await asAdmin(async (c) => {
    await c.query(
      `delete from public.whatsapp_outbound where tenant_id in ($1, $2)`,
      [s.tenantA, s.tenantB],
    );
    await c.query(
      `delete from public.whatsapp_inbound where tenant_id in ($1, $2)`,
      [s.tenantA, s.tenantB],
    );
  });
  await teardownScenario(s);
});

describe("la bandeja", () => {
  it("muestra las conversaciones del negocio propio", async () => {
    const filas = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select telefono, sin_responder from public.whatsapp_conversaciones($1)`,
        [s.tenantA],
      );
      return rows as Array<{ telefono: string; sin_responder: boolean }>;
    });

    const telefonos = filas.map((f) => f.telefono);
    expect(telefonos).toContain(TELEFONO_A);
    // Escribió y nadie contestó todavía.
    expect(filas.find((f) => f.telefono === TELEFONO_A)?.sin_responder).toBe(true);
  });

  it("no deja ver las de otro negocio ni pidiéndolas por su id", async () => {
    // El parámetro es un id de estética: si la función confiara en él, con
    // cambiar un número en la URL se leería la bandeja del vecino. Lo que lo
    // impide es la RLS de las tablas de abajo, no el parámetro.
    const filas = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select telefono from public.whatsapp_conversaciones($1)`,
        [s.tenantB],
      );
      return rows;
    });

    expect(filas).toHaveLength(0);
  });

  it("calcula la ventana de 24 horas desde el último mensaje de la clienta", async () => {
    const filas = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select telefono,
                ventana_hasta > now() as abierta
         from public.whatsapp_conversaciones($1)`,
        [s.tenantA],
      );
      return rows as Array<{ telefono: string; abierta: boolean }>;
    });

    expect(filas.find((f) => f.telefono === TELEFONO_A)?.abierta).toBe(true);
    // La de hace dos días ya cerró: Meta no acepta texto libre ahí.
    expect(filas.find((f) => f.telefono === "5493584333333")?.abierta).toBe(false);
  });

  it("mezcla lo que entra con lo que sale, en orden", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `select public.rpc_record_outbound($1, $2, $3, 'wamid.out.1', null, null)`,
        [s.tenantA, TELEFONO_A, "Claro que sí, no hay problema."],
      );
    });

    const hilo = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select entrante, body from public.whatsapp_conversacion($1, $2)`,
        [s.tenantA, TELEFONO_A],
      );
      return rows as Array<{ entrante: boolean; body: string }>;
    });

    expect(hilo).toHaveLength(2);
    expect(hilo[0].entrante).toBe(true);
    expect(hilo[1].entrante).toBe(false);
    expect(hilo[1].body).toContain("no hay problema");
  });

  it("un envío fallido no aparece en la conversación", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `select public.rpc_record_outbound($1, $2, $3, null, null, $4)`,
        [s.tenantA, TELEFONO_A, "Esto no salió", "131047: fuera de ventana"],
      );
    });

    const hilo = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select body from public.whatsapp_conversacion($1, $2)`,
        [s.tenantA, TELEFONO_A],
      );
      return rows.map((r) => r.body as string);
    });

    // Queda guardado para poder explicar por qué no llegó, pero mostrarlo en
    // el hilo haría creer que la clienta lo leyó.
    expect(hilo).not.toContain("Esto no salió");
  });

  it("authenticated puede leer lo que sale, nunca escribirlo", async () => {
    // Mandar un WhatsApp necesita el token del negocio, que authenticated no
    // puede ver. Si además pudiera insertar acá, cualquiera con la consola
    // abierta se inventaría respuestas que nunca salieron.
    const permisos = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select privilege_type from information_schema.role_table_grants
         where table_name = 'whatsapp_outbound' and table_schema = 'public'
           and grantee = 'authenticated'`,
      );
      return rows.map((r) => r.privilege_type as string);
    });

    expect(permisos).toEqual(["SELECT"]);

    const code = await asUser(s.owner, (c) =>
      expectRejected(() =>
        c.query(
          `insert into public.whatsapp_outbound (tenant_id, to_phone, body)
           values ($1, $2, 'inventado')`,
          [s.tenantA, TELEFONO_A],
        ),
      ),
    );

    expect(code).toBe("42501");
  });

  it("las dos tablas están publicadas en Realtime", async () => {
    const publicadas = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select tablename from pg_publication_tables
         where pubname = 'supabase_realtime'`,
      );
      return rows.map((r) => r.tablename as string);
    });

    expect(publicadas).toContain("whatsapp_inbound");
    expect(publicadas).toContain("whatsapp_outbound");
  });
});
