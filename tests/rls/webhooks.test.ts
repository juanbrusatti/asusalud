import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
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
        `select app.handle_inbound($1, 'wamid.btn1', $2, 'button', 'Confirmar', $3) ->> 'accion' as accion`,
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

  it("el botón de cancelar cancela de verdad y libera el horario", async () => {
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
        `select app.handle_inbound($1, 'wamid.cancel1', $2, 'button', 'Cancelar', $3) as r`,
        [PHONE_ID, TELEFONO, `cancelar:${turno}`],
      );
      const r = rows[0].r as { accion: string; responder?: { texto: string } };
      expect(r.accion).toBe("turno_cancelado");

      const { rows: estado } = await c.query(
        `select status, cancel_reason from public.appointments where id = $1`,
        [turno],
      );
      expect(estado[0].status).toBe("cancelled");
      // Que quede escrito quién lo canceló: en la agenda, un turno que
      // desaparece sin explicación es una discusión al día siguiente.
      expect(estado[0].cancel_reason).toContain("el cliente");
    });
  });

  it("queda registrado que lo canceló el cliente y no el equipo", async () => {
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
      await c.query(
        `select app.handle_inbound($1, 'wamid.cancel2', $2, 'button', 'Cancelar', $3)`,
        [PHONE_ID, TELEFONO, `cancelar:${turno}`],
      );

      const { rows } = await c.query(
        `select by_client from public.appointment_status_history
         where appointment_id = $1 and to_status = 'cancelled'`,
        [turno],
      );
      expect(rows[0].by_client).toBe(true);
    });
  });

  it("el botón de cambiar horario contesta con el enlace del turno", async () => {
    const { turno, token } = await comoSistema(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], now() + interval '2 days') as id`,
        [cliente, [servicio]],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
      const { rows: t } = await c.query(
        `select manage_token from public.appointments where id = $1`,
        [rows[0].id],
      );
      return { turno: rows[0].id as string, token: t[0].manage_token as string };
    });

    await comoSistema(async (c) => {
      const { rows } = await c.query(
        `select app.handle_inbound($1, 'wamid.mover1', $2, 'button', 'Cambiar horario', $3) as r`,
        [PHONE_ID, TELEFONO, `reprogramar:${turno}`],
      );
      const r = rows[0].r as { accion: string; responder?: { texto: string } };

      expect(r.accion).toBe("pidio_reprogramar");
      // Antes esto sólo dejaba una nota y alguien tenía que llamar. Ahora el
      // cliente recibe el enlace y elige el horario solo.
      expect(r.responder?.texto).toContain(token);
    });
  });

  it("no cancela el turno de otro negocio aunque le manden el id correcto", async () => {
    const turno = await comoSistema(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], now() + interval '3 days') as id`,
        [cliente, [servicio]],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
      return rows[0].id as string;
    });

    await comoSistema(async (c) => {
      // El otro negocio, con su propio número conectado.
      await c.query(
        `insert into public.whatsapp_accounts
           (tenant_id, phone_number_id, access_token, app_secret, verify_token, status)
         values ($1, 'numero-del-otro', 'token', 'secreto', 'verif', 'connected')`,
        [s.tenantB],
      );

      const { rows } = await c.query(
        `select app.handle_inbound('numero-del-otro', 'wamid.cruzado', $1,
                                   'button', 'Cancelar', $2) ->> 'accion' as accion`,
        [TELEFONO, `cancelar:${turno}`],
      );
      expect(rows[0].accion).toBe("cancelacion_sin_efecto");

      const { rows: estado } = await c.query(
        `select status from public.appointments where id = $1`,
        [turno],
      );
      // El id de un turno no es una llave. Sin el filtro por negocio, quien
      // conociera un id podría cancelar turnos ajenos desde su propio número.
      expect(estado[0].status).toBe("pending");

      // Se limpia acá: las pruebas de aislamiento cuentan lo que hay, y esta
      // cuenta prestada les cambiaría el resultado.
      await c.query(
        `delete from public.whatsapp_inbound where wa_message_id = 'wamid.cruzado'`,
      );
      await c.query(
        `delete from public.whatsapp_accounts where phone_number_id = 'numero-del-otro'`,
      );
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
        `select app.handle_inbound($1, 'wamid.btn2', $2, 'button', 'Reprogramar', $3) ->> 'accion' as accion`,
        [PHONE_ID, TELEFONO, `reprogramar:${turno}`],
      );
      expect(rows[0].accion).toBe("pidio_reprogramar");

      // El turno sigue en pie: moverlo solo sería peor que no hacer nada. Lo
      // que cambió es que ahora se le contesta con el enlace para que elija.
      const { rows: estado } = await c.query(
        `select status from public.appointments where id = $1`,
        [turno],
      );
      expect(estado[0].status).toBe("pending");

      const { rows: notas } = await c.query(
        `select body from public.client_notes where client_id = $1`,
        [cliente],
      );
      expect(notas).toHaveLength(1);
      // La nota dice lo mismo que leyó el cliente en el botón.
      expect(notas[0].body).toContain("cambiar el horario");
    });
  });

  it("da de baja a quien lo pide, escriba como escriba", async () => {
    for (const [i, texto] of ["BAJA", "no me escriban mas", "  Stop  "].entries()) {
      await comoSistema(async (c) => {
        await c.query(`delete from public.opt_outs where tenant_id = $1`, [s.tenantA]);
        const { rows } = await c.query(
          `select app.handle_inbound($1, $2, $3, 'text', $4, null) ->> 'accion' as accion`,
          [PHONE_ID, `wamid.baja${i}`, TELEFONO, texto],
        );
        expect(rows[0].accion, `con "${texto}"`).toBe("dado_de_baja");

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
        `select app.handle_inbound($1, 'wamid.hola', $2, 'text', 'Hola, gracias!', null) ->> 'accion' as accion`,
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
        `select app.handle_inbound($1, 'wamid.repe', $2, 'text', 'BAJA', null) ->> 'accion' as accion`,
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
        `select app.handle_inbound('numero-ajeno', 'wamid.x', $1, 'text', 'BAJA', null) ->> 'accion' as accion`,
        [TELEFONO],
      );
      expect(rows[0].accion).toBe("sin_negocio");
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

describe("las credenciales de Meta", () => {
  it("no las puede leer nadie que navegue, ni la dueña", async () => {
    const codigo = await asUser(s.owner, (c) =>
      expectRejected(() =>
        c.query(`select public.rpc_whatsapp_credentials($1)`, [s.tenantA]),
      ),
    );
    // El token manda mensajes en nombre del negocio. No vuelve nunca a la
    // aplicación: lo leen el emisor y la revisión, que corren con permisos
    // del sistema.
    expect(codigo).toBe("42501");
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
