import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, pool } from "./helpers";
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

  it("cada regla tiene plantilla para los tres canales", async () => {
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
      // Sin las tres, la cascada se queda sin salida justo en el canal gratis.
      expect(regla.canales.sort()).toEqual(["email", "push", "whatsapp"]);
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
