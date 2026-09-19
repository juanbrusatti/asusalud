import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * Una cuenta nueva tiene que nacer sabiendo avisar.
 *
 * Antes nacía con cero reglas y cero plantillas, así que el planificador
 * corría, no encontraba nada y no programaba nada. El recordatorio —que es la
 * razón por la que alguien cambia de sistema— no funcionaba hasta que la
 * persona construyera todo desde cero, y nadie construye desde cero.
 */

let s: Scenario;

beforeAll(async () => {
  s = await setupScenario("fab");
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

describe("una cuenta recién creada", () => {
  it("nace con reglas y con plantillas", async () => {
    const { reglas, plantillas } = await asAdmin(async (c) => {
      const r = await c.query(
        `select count(*)::int as n from public.reminder_rules where tenant_id = $1`,
        [s.tenantA],
      );
      const p = await c.query(
        `select count(*)::int as n from public.message_templates where tenant_id = $1`,
        [s.tenantA],
      );
      return { reglas: r.rows[0].n as number, plantillas: p.rows[0].n as number };
    });

    expect(reglas).toBeGreaterThan(0);
    expect(plantillas).toBeGreaterThan(0);
  });

  it("enciende una sola regla, y es la del día anterior", async () => {
    const encendidas = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select name, trigger::text, offset_minutes
         from public.reminder_rules
         where tenant_id = $1 and enabled`,
        [s.tenantA],
      );
      return rows as Array<{
        name: string;
        trigger: string;
        offset_minutes: number;
      }>;
    });

    // Un sistema que empieza mandando cuatro mensajes por turno es un sistema
    // que termina con la cuenta de WhatsApp bloqueada.
    expect(encendidas).toHaveLength(1);
    expect(encendidas[0].trigger).toBe("before_appointment");
    expect(encendidas[0].offset_minutes).toBe(-1440);
  });

  it("no manda de madrugada: la regla encendida tiene franja horaria", async () => {
    const franja = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select send_window_start, send_window_end
         from public.reminder_rules
         where tenant_id = $1 and enabled`,
        [s.tenantA],
      );
      return rows[0] as {
        send_window_start: string | null;
        send_window_end: string | null;
      };
    });

    expect(franja.send_window_start).not.toBeNull();
    expect(franja.send_window_end).not.toBeNull();
  });

  it("cada regla nace con su plantilla de WhatsApp y con ninguna otra", async () => {
    const sueltas = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select r.name, array_agg(rt.channel::text order by rt.channel::text) as canales
         from public.reminder_rules r
         left join public.rule_templates rt on rt.rule_id = r.id
         where r.tenant_id = $1
         group by r.id, r.name`,
        [s.tenantA],
      );
      return rows as Array<{ name: string; canales: string[] }>;
    });

    expect(sueltas.length).toBeGreaterThan(0);
    for (const regla of sueltas) {
      // Las clientas de una estética se manejan por WhatsApp: una push pide
      // que acepten notificaciones en el navegador y el correo pide tener
      // correo cargado, así que la cascada terminaba bajando a WhatsApp de
      // todos modos, con cuatro plantillas de más para mantener.
      //
      // El motor de canales sigue entero: volver a encender correo es agregar
      // el canal a la regla. Lo que cambió es con qué nace una cuenta.
      expect(regla.canales, regla.name).toEqual(["whatsapp"]);
    }
  });

  it("las plantillas de WhatsApp traen el nombre que hay que dar de alta en Meta", async () => {
    const nombres = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select provider_name from public.message_templates
         where tenant_id = $1 and channel = 'whatsapp'`,
        [s.tenantA],
      );
      return rows.map((r) => r.provider_name as string | null);
    });

    expect(nombres.length).toBeGreaterThan(0);
    for (const n of nombres) {
      expect(n).toBeTruthy();
      // Meta sólo acepta minúsculas, números y guiones bajos.
      expect(n).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("ninguna plantilla de WhatsApp termina en un hueco", async () => {
    const cuerpos = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select name, body from public.message_templates
         where tenant_id = $1 and channel = 'whatsapp'`,
        [s.tenantA],
      );
      return rows as Array<{ name: string; body: string }>;
    });

    expect(cuerpos.length).toBeGreaterThan(0);
    for (const t of cuerpos) {
      // Meta rechaza las plantillas cuyo cuerpo empieza o termina con una
      // variable, y lo hace con un «código 100» genérico que no explica nada.
      // Nos pasó en la primera prueba real contra Meta.
      expect(t.body.trim(), t.name).not.toMatch(/\}\}$/);
      expect(t.body.trim(), t.name).not.toMatch(/^\{\{/);
    }
  });

  it("no vuelve a escribir encima de lo que ya está", async () => {
    const antes = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.message_templates where tenant_id = $1`,
        [s.tenantA],
      );
      return rows[0].n as number;
    });

    await asAdmin((c) =>
      c.query(`select app.seed_messaging($1)`, [s.tenantA]),
    );

    const despues = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.message_templates where tenant_id = $1`,
        [s.tenantA],
      );
      return rows[0].n as number;
    });

    expect(despues).toBe(antes);
  });
});

describe("borrar un mensaje", () => {
  it("la base no deja borrar uno que una regla está usando", async () => {
    const enUso = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select rt.template_id from public.rule_templates rt
         where rt.tenant_id = $1 limit 1`,
        [s.tenantA],
      );
      return rows[0].template_id as string;
    });

    const codigo = await asUser(s.owner, (c) =>
      expectRejected(() =>
        c.query(`delete from public.message_templates where id = $1`, [enUso]),
      ),
    );

    // 23503: la regla se quedaría sin qué mandar por ese canal, y eso no se
    // descubre hasta que alguien no recibe su recordatorio.
    expect(codigo).toBe("23503");
  });

  it("uno que no usa ninguna regla se borra", async () => {
    const suelto = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `insert into public.message_templates
           (tenant_id, name, channel, category, body)
         values ($1, 'Mensaje suelto de prueba', 'push', 'utility',
                 'Hola {{cliente}}, te esperamos.')
         returning id`,
        [s.tenantA],
      );
      return rows[0].id as string;
    });

    // La comprobación va DENTRO de la misma transacción: `asUser` revierte al
    // terminar, así que mirar después no diría nada sobre el borrado.
    const quedan = await asUser(s.owner, async (c) => {
      await c.query(`delete from public.message_templates where id = $1`, [
        suelto,
      ]);
      const { rows } = await c.query(
        `select count(*)::int as n from public.message_templates where id = $1`,
        [suelto],
      );
      return rows[0].n as number;
    });

    expect(quedan).toBe(0);

    await asAdmin((c) =>
      c.query(`delete from public.message_templates where id = $1`, [suelto]),
    );
  });

  it("una profesional no puede borrar mensajes", async () => {
    const alguno = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select id from public.message_templates where tenant_id = $1 limit 1`,
        [s.tenantA],
      );
      return rows[0].id as string;
    });

    const quedan = await asUser(s.staff, async (c) => {
      // La RLS no da error: simplemente no borra nada. Por eso hay que
      // contar adentro de la transacción, o el test pasaría igual aunque
      // la política no existiera.
      await c.query(`delete from public.message_templates where id = $1`, [
        alguno,
      ]);
      const { rows } = await c.query(
        `select count(*)::int as n from public.message_templates where id = $1`,
        [alguno],
      );
      return rows[0].n as number;
    });

    expect(quedan).toBe(1);
  });
});
