import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;
let cliente: string;
let servicio: string;

const PHONE_ID = "1234567890";
const TELEFONO = "5493584123456";

async function comoSistema<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return asAdmin(fn);
}

beforeAll(async () => {
  s = await setupScenario("whk");

  const setup = await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: s.owner, role: "authenticated" }),
    ]);

    const { rows: sv } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Depilación', 40, 20, 'fixed', 1000000) returning id`,
      [s.tenantA],
    );
    const { rows: cl } = await c.query(
      `insert into public.clients (tenant_id, first_name, phone_e164, email)
       values ($1, 'Mirián', $2, 'mirian@test.local') returning id`,
      [s.tenantA, `+${TELEFONO}`],
    );
    await c.query("select set_config('request.jwt.claims', '', false)");
    return { servicio: sv[0].id as string, cliente: cl[0].id as string };
  });

  servicio = setup.servicio;
  cliente = setup.cliente;

  await asAdmin(async (c) => {
    await c.query(
      `insert into public.whatsapp_accounts
         (tenant_id, phone_number_id, access_token, app_secret, verify_token, status)
       values ($1, $2, 'token', 'secreto-de-firma', 'token-de-verificacion', 'connected')`,
      [s.tenantA, PHONE_ID],
    );
  });
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

beforeEach(async () => {
  await asAdmin(async (c) => {
    await c.query(`delete from public.whatsapp_inbound where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.opt_outs where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.client_notes where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.message_jobs where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.appointments where tenant_id = $1`, [s.tenantA]);
    await c.query(
      `update public.messaging_settings
       set sending_enabled = true, paused_reason = null where tenant_id = $1`,
      [s.tenantA],
    );
    await c.query(
      `update public.whatsapp_accounts
       set quality_rating = 'GREEN', status = 'connected' where tenant_id = $1`,
      [s.tenantA],
    );
  });
});

// ---------------------------------------------------------------------------

describe("estados de entrega", () => {
  async function envio(providerId: string): Promise<string> {
    return comoSistema(async (c) => {
      const { rows } = await c.query(
        `insert into public.message_jobs
           (tenant_id, client_id, channel, scheduled_for, status,
            provider_message_id, dedupe_key)
         values ($1, $2, 'whatsapp', now(), 'sent', $3, 'k-' || gen_random_uuid())
         returning id`,
        [s.tenantA, cliente, providerId],
      );
      return rows[0].id as string;
    });
  }

  it("marca entregado y después leído", async () => {
    const id = await envio("wamid.1");

    await comoSistema(async (c) => {
      await c.query(`select app.record_delivery('wamid.1', 'delivered')`);
      await c.query(`select app.record_delivery('wamid.1', 'read')`);

      const { rows } = await c.query(
        `select delivered_at is not null as entregado, read_at is not null as leido
         from public.message_jobs where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({ entregado: true, leido: true });
    });
  });

  it("un estado que llega tarde no borra lo que ya sabíamos", async () => {
    const id = await envio("wamid.2");

    await comoSistema(async (c) => {
      // Meta manda los estados desordenados: primero llega "leído" y después
      // el "entregado" que venía atrasado.
      await c.query(`select app.record_delivery('wamid.2', 'read')`);
      const { rows: antes } = await c.query(
        `select read_at from public.message_jobs where id = $1`,
        [id],
      );

      await c.query(`select app.record_delivery('wamid.2', 'delivered')`);

      const { rows } = await c.query(
        `select read_at from public.message_jobs where id = $1`,
        [id],
      );
      // El sello de lectura se conserva: sólo se avanza, nunca se retrocede.
      expect(rows[0].read_at).toEqual(antes[0].read_at);
    });
  });

  it("un fallo informado por Meta marca el envío como fallado", async () => {
    const id = await envio("wamid.3");

    await comoSistema(async (c) => {
      await c.query(
        `select app.record_delivery('wamid.3', 'failed', 'Número no existe en WhatsApp')`,
      );

      const { rows } = await c.query(
        `select status, last_error from public.message_jobs where id = $1`,
        [id],
      );
      expect(rows[0].status).toBe("failed");
      expect(rows[0].last_error).toContain("no existe");
    });
  });
});

describe("respuestas de los clientes", () => {
  it("confirma el turno desde el botón del recordatorio", async () => {
    const turno = await comoSistema(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], now() + interval '2 days') as id`,
        [cliente, [servicio]],
      );
      await c.query(
        `update public.appointments set status = 'pending' where id = $1`,
        [rows[0].id],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
      return rows[0].id as string;
    });

    await comoSistema(async (c) => {
      const { rows } = await c.query(
        `select app.handle_inbound($1, 'wamid.btn1', $2, 'button', 'Confirmar', $3) as accion`,
        [PHONE_ID, TELEFONO, `confirmar:${turno}`],
      );
      expect(rows[0].accion).toBe("turno_confirmado");

      const { rows: estado } = await c.query(
        `select status from public.appointments where id = $1`,
        [turno],
      );
      // Es el ahorro concreto: un mensaje menos que alguien tiene que leer y
      // ejecutar a mano.
      expect(estado[0].status).toBe("confirmed");
    });
  });

  it("un pedido de reprogramar no toca la agenda, deja una nota", async () => {
    const turno = await comoSistema(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], now() + interval '2 days') as id`,
        [cliente, [servicio]],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
      return rows[0].id as string;
    });

    await comoSistema(async (c) => {
      const { rows } = await c.query(
        `select app.handle_inbound($1, 'wamid.btn2', $2, 'button', 'Reprogramar', $3) as accion`,
        [PHONE_ID, TELEFONO, `reprogramar:${turno}`],
      );
      expect(rows[0].accion).toBe("pidio_reprogramar");

      // El turno sigue en pie: moverlo solo sería peor que no hacer nada.
      const { rows: estado } = await c.query(
        `select status from public.appointments where id = $1`,
        [turno],
      );
      expect(estado[0].status).toBe("confirmed");

      const { rows: notas } = await c.query(
        `select body from public.client_notes where client_id = $1`,
        [cliente],
      );
      expect(notas).toHaveLength(1);
      expect(notas[0].body).toContain("reprogramar");
    });
  });

  it("da de baja a quien lo pide, escriba como escriba", async () => {
    for (const [i, texto] of ["BAJA", "no me escriban mas", "  Stop  "].entries()) {
      await comoSistema(async (c) => {
        await c.query(`delete from public.opt_outs where tenant_id = $1`, [s.tenantA]);
        const { rows } = await c.query(
          `select app.handle_inbound($1, $2, $3, 'text', $4, null) as accion`,
          [PHONE_ID, `wamid.baja${i}`, TELEFONO, texto],
        );
        expect(rows[0].accion, `con "${texto}"`).toBe("dada_de_baja");

        const { rows: bajas } = await c.query(
          `select channel from public.opt_outs where client_id = $1`,
          [cliente],
        );
        expect(bajas).toHaveLength(1);
        expect(bajas[0].channel).toBe("whatsapp");
      });
    }
  });

  it("la baja hace que deje de resolverse el canal de WhatsApp", async () => {
    await comoSistema(async (c) => {
      await c.query(
        `select app.handle_inbound($1, 'wamid.baja-efecto', $2, 'text', 'BAJA', null)`,
        [PHONE_ID, TELEFONO],
      );

      const { rows } = await c.query(
        `select app.resolve_channel($1, '{whatsapp}'::public.message_channel[]) as canal`,
        [cliente],
      );
      // Una baja ignorada no es un error de producto: es una denuncia.
      expect(rows[0].canal).toBeNull();
    });
  });

  it("un mensaje cualquiera se registra sin hacer nada", async () => {
    await comoSistema(async (c) => {
      const { rows } = await c.query(
        `select app.handle_inbound($1, 'wamid.hola', $2, 'text', 'Hola, gracias!', null) as accion`,
        [PHONE_ID, TELEFONO],
      );
      expect(rows[0].accion).toBe("registrado");
    });
  });

  it("reprocesar el mismo aviso no repite la acción", async () => {
    await comoSistema(async (c) => {
      await c.query(
        `select app.handle_inbound($1, 'wamid.repe', $2, 'text', 'BAJA', null)`,
        [PHONE_ID, TELEFONO],
      );
      // Meta reintenta lo que no contesta a tiempo.
      const { rows } = await c.query(
        `select app.handle_inbound($1, 'wamid.repe', $2, 'text', 'BAJA', null) as accion`,
        [PHONE_ID, TELEFONO],
      );
      expect(rows[0].accion).toBe("repetido");

      const { rows: bajas } = await c.query(
        `select count(*)::int as n from public.opt_outs where client_id = $1`,
        [cliente],
      );
      expect(bajas[0].n).toBe(1);
    });
  });

  it("un aviso de un número que no conocemos no hace nada", async () => {
    await comoSistema(async (c) => {
      const { rows } = await c.query(
        `select app.handle_inbound('numero-ajeno', 'wamid.x', $1, 'text', 'BAJA', null) as accion`,
        [TELEFONO],
      );
      expect(rows[0].accion).toBe("sin_estetica");
    });
  });
});

describe("salud de la cuenta", () => {
  it("guarda la calidad que informa Meta", async () => {
    await comoSistema(async (c) => {
      await c.query(
        `select app.record_account_health($1, 'YELLOW', 'TIER_1K', null)`,
        [PHONE_ID],
      );

      const { rows } = await c.query(
        `select quality_rating, messaging_limit, last_checked_at
         from public.whatsapp_accounts where tenant_id = $1`,
        [s.tenantA],
      );
      expect(rows[0].quality_rating).toBe("YELLOW");
      expect(rows[0].messaging_limit).toBe("TIER_1K");
      expect(rows[0].last_checked_at).not.toBeNull();
    });
  });

  it("amarillo avisa pero no frena", async () => {
    await comoSistema(async (c) => {
      await c.query(`select app.record_account_health($1, 'YELLOW', null, null)`, [
        PHONE_ID,
      ]);
      const { rows } = await c.query(
        `select sending_enabled from public.messaging_settings where tenant_id = $1`,
        [s.tenantA],
      );
      expect(rows[0].sending_enabled).toBe(true);
    });
  });

  it("rojo frena todo y vacía la cola", async () => {
    await comoSistema(async (c) => {
      await c.query(
        `insert into public.message_jobs
           (tenant_id, client_id, channel, scheduled_for, status, dedupe_key)
         values ($1, $2, 'whatsapp', now() + interval '1 hour', 'pending', 'pendiente-1')`,
        [s.tenantA, cliente],
      );

      await c.query(`select app.record_account_health($1, 'RED', null, null)`, [
        PHONE_ID,
      ]);

      const { rows: ajustes } = await c.query(
        `select sending_enabled, paused_reason
         from public.messaging_settings where tenant_id = $1`,
        [s.tenantA],
      );
      // Seguir enviando desde una cuenta en rojo es el camino directo a que
      // Meta la limite.
      expect(ajustes[0].sending_enabled).toBe(false);
      expect(ajustes[0].paused_reason).toContain("rojo");

      const { rows: cola } = await c.query(
        `select status from public.message_jobs where tenant_id = $1`,
        [s.tenantA],
      );
      expect(cola[0].status).toBe("cancelled");
    });
  });

  it("una restricción de Meta también frena", async () => {
    await comoSistema(async (c) => {
      await c.query(
        `select app.record_account_health($1, null, null, 'restricted')`,
        [PHONE_ID],
      );
      const { rows } = await c.query(
        `select sending_enabled from public.messaging_settings where tenant_id = $1`,
        [s.tenantA],
      );
      expect(rows[0].sending_enabled).toBe(false);
    });
  });
});

describe("aislamiento", () => {
  it("el negocio vecino no ve las respuestas", async () => {
    await comoSistema(async (c) => {
      await c.query(
        `select app.handle_inbound($1, 'wamid.priv', $2, 'text', 'Hola', null)`,
        [PHONE_ID, TELEFONO],
      );
    });

    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select id from public.whatsapp_inbound`);
      expect(rows).toHaveLength(0);
    });

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select body from public.whatsapp_inbound`);
      expect(rows).toHaveLength(1);
    });
  });
});
