import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asAdmin, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * El tope de gasto del mes.
 *
 * El campo existía desde el primer día y no lo miraba nadie: era el cinturón
 * de seguridad sin abrochar. Una regla mal configurada o una importación que
 * crea quinientos turnos disparaban la factura de Meta sin que nada la frenara.
 */

let s: Scenario;
let cliente: string;

/** Deja un envío listo para que el emisor lo tome, con el costo que se le diga. */
async function encolar(channel: string, costo: number): Promise<string> {
  return asAdmin(async (c) => {
    const { rows } = await c.query(
      `insert into public.message_jobs
         (tenant_id, client_id, channel, scheduled_for, status, cost_cents, dedupe_key)
       values ($1, $2, $3::public.message_channel, now() - interval '1 minute',
               'pending', $4, 'tope-' || gen_random_uuid())
       returning id`,
      [s.tenantA, cliente, channel, costo],
    );
    return rows[0].id as string;
  });
}

/** Da por enviado un mensaje de este mes, para que cuente contra el tope. */
async function yaGastado(costo: number) {
  await asAdmin((c) =>
    c.query(
      `insert into public.message_jobs
         (tenant_id, client_id, channel, scheduled_for, status, cost_cents,
          sent_at, was_test, dedupe_key)
       values ($1, $2, 'whatsapp', now(), 'sent', $3, now(), false,
               'gastado-' || gen_random_uuid())`,
      [s.tenantA, cliente, costo],
    ),
  );
}

async function tope(cents: number | null) {
  await asAdmin((c) =>
    c.query(
      `update public.messaging_settings set monthly_budget_cents = $2
       where tenant_id = $1`,
      [s.tenantA, cents],
    ),
  );
}

/** Corre el emisor y devuelve cómo quedó ese envío. */
async function tomar(id: string): Promise<{ status: string; motivo: string | null }> {
  return asAdmin(async (c) => {
    await c.query(`select app.claim_due_jobs(50)`);
    const { rows } = await c.query(
      `select status::text, skip_reason from public.message_jobs where id = $1`,
      [id],
    );
    return { status: rows[0].status as string, motivo: rows[0].skip_reason };
  });
}

beforeAll(async () => {
  s = await setupScenario("tope");

  cliente = await asAdmin(async (c) => {
    const { rows } = await c.query(
      // El teléfono se normaliza en la aplicación, no en la base: si acá se
      // deja sólo `phone_raw`, `phone_e164` queda nulo y WhatsApp no es una
      // opción para esta persona.
      `insert into public.clients (tenant_id, first_name, phone_raw, phone_e164, email)
       values ($1, 'Prueba', '3584123456', '+5493584123456', 'prueba@tope.test')
       returning id`,
      [s.tenantA],
    );
    return rows[0].id as string;
  });
});

beforeEach(async () => {
  await asAdmin((c) =>
    c.query(`delete from public.message_jobs where tenant_id = $1`, [s.tenantA]),
  );
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

describe("el tope de gasto del mes", () => {
  it("deja pasar lo que entra en el tope", async () => {
    await tope(1000000);
    await yaGastado(100000);

    const id = await encolar("whatsapp", 3768);
    expect((await tomar(id)).status).toBe("sending");
  });

  it("frena lo que lo pasaría, y dice por qué", async () => {
    await tope(500000);
    await yaGastado(499000);

    const id = await encolar("whatsapp", 3768);
    const r = await tomar(id);

    expect(r.status).toBe("skipped");
    expect(r.motivo).toMatch(/Tope del mes/);
  });

  it("no frena los canales gratis aunque el mes esté agotado", async () => {
    await tope(100000);
    await yaGastado(999999);

    // Un tope de plata que apaga las notificaciones no protege nada: deja a la
    // gente sin avisar por ahorrar cero.
    const id = await encolar("push", 0);
    expect((await tomar(id)).status).toBe("sending");
  });

  it("sin tope puesto no frena nada", async () => {
    await tope(null);
    await yaGastado(50000000);

    const id = await encolar("whatsapp", 3768);
    expect((await tomar(id)).status).toBe("sending");
  });

  it("los envíos de prueba no gastan del tope", async () => {
    await tope(100000);

    await asAdmin((c) =>
      c.query(
        `insert into public.message_jobs
           (tenant_id, client_id, channel, scheduled_for, status, cost_cents,
            sent_at, was_test, dedupe_key)
         values ($1, $2, 'whatsapp', now(), 'sent', 99000, now(), true,
                 'prueba-' || gen_random_uuid())`,
        [s.tenantA, cliente],
      ),
    );

    const id = await encolar("whatsapp", 3768);
    expect((await tomar(id)).status).toBe("sending");
  });
});

describe("el correo, mientras el negocio no lo use", () => {
  it("la cascada lo saltea aunque la ficha tenga correo", async () => {
    const canal = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select app.resolve_channel($1, '{push,email,whatsapp}'::public.message_channel[])::text as ch`,
        [cliente],
      );
      return rows[0].ch as string | null;
    });

    // Ofrecer un canal que no puede entregar es peor que no ofrecerlo: se
    // elige, no llega, y nadie entiende por qué.
    expect(canal).toBe("whatsapp");
  });

  it("vuelve solo cuando el negocio lo prende, sin tocar ninguna regla", async () => {
    const canal = await asAdmin(async (c) => {
      await c.query(
        `update public.messaging_settings set email_enabled = true where tenant_id = $1`,
        [s.tenantA],
      );
      const { rows } = await c.query(
        `select app.resolve_channel($1, '{push,email,whatsapp}'::public.message_channel[])::text as ch`,
        [cliente],
      );
      await c.query(
        `update public.messaging_settings set email_enabled = false where tenant_id = $1`,
        [s.tenantA],
      );
      return rows[0].ch as string | null;
    });

    // Las reglas siguen diciendo push → correo → WhatsApp; lo único que cambió
    // es que ahora el correo se puede entregar.
    expect(canal).toBe("email");
  });
});
