import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;
let servicio: string;
/** Tiene correo y teléfono: la cascada puede elegir. */
let conAmbos: string;
/** Sólo teléfono: WhatsApp o nada. */
let soloTelefono: string;
/** Ni correo ni teléfono: no hay forma de avisarle. */
let sinCanales: string;
let plantillaEmail: string;
let plantillaWhatsapp: string;

/** Corre el planificador con permisos del sistema. */
async function planificar(horizonte = "72 hours"): Promise<number> {
  return asAdmin(async (c) => {
    const { rows } = await c.query(
      `select app.plan_reminders($1::interval) as n`,
      [horizonte],
    );
    return rows[0].n as number;
  });
}

/**
 * Deja la estética sin reglas ni turnos.
 *
 * Las pruebas del planificador confirman sus datos a propósito (el
 * planificador corre en su propia conexión y no vería nada de una transacción
 * abierta), así que la limpieza tiene que ser explícita. Sin esto, las reglas
 * de una prueba se cuelan en la siguiente y los conteos dejan de significar
 * nada.
 */
async function limpiarTodo() {
  await asAdmin(async (c) => {
    await c.query(`delete from public.message_jobs where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.reminder_rules where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.appointments where tenant_id = $1`, [s.tenantA]);
  });
}

/** Crea una regla y le engancha plantillas por canal. */
async function crearRegla(
  c: PoolClient,
  campos: Record<string, unknown>,
  plantillas: Array<[string, string]> = [],
): Promise<string> {
  const base = {
    tenant_id: s.tenantA,
    name: "Regla",
    enabled: true,
    trigger: "before_appointment",
    offset_minutes: -1440,
    channel_order: "{email,whatsapp}",
    ...campos,
  };

  const cols = Object.keys(base);
  const { rows } = await c.query(
    `insert into public.reminder_rules (${cols.join(", ")})
     values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(base),
  );
  const id = rows[0].id as string;

  for (const [canal, plantilla] of plantillas) {
    await c.query(
      `insert into public.rule_templates (rule_id, channel, template_id, tenant_id)
       values ($1, $2, $3, $4)`,
      [id, canal, plantilla, s.tenantA],
    );
  }

  return id;
}

/** Agenda un turno dentro de N horas. */
async function turnoEn(c: PoolClient, horas: number, clientId: string) {
  const { rows } = await c.query(
    `select public.book_appointment($1, $2::uuid[], now() + make_interval(hours => $3::int)) as id`,
    [clientId, [servicio], horas],
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  s = await setupScenario("rem");

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
    const { rows: c1 } = await c.query(
      `insert into public.clients (tenant_id, first_name, email, phone_e164)
       values ($1, 'Ambos', 'ambos@test.local', '+5493584111111') returning id`,
      [s.tenantA],
    );
    const { rows: c2 } = await c.query(
      `insert into public.clients (tenant_id, first_name, phone_e164)
       values ($1, 'SoloTel', '+5493584222222') returning id`,
      [s.tenantA],
    );
    const { rows: c3 } = await c.query(
      `insert into public.clients (tenant_id, first_name)
       values ($1, 'SinCanal') returning id`,
      [s.tenantA],
    );
    const { rows: t1 } = await c.query(
      `insert into public.message_templates (tenant_id, name, channel, body, subject)
       values ($1, 'Recordatorio correo', 'email',
               'Hola {{cliente}}, te esperamos el {{fecha}} a las {{hora}}.',
               'Tu turno en {{estetica}}') returning id`,
      [s.tenantA],
    );
    const { rows: t2 } = await c.query(
      `insert into public.message_templates
         (tenant_id, name, channel, body, provider_name, provider_status)
       values ($1, 'Recordatorio WhatsApp', 'whatsapp',
               'Hola {{cliente}}, te esperamos el {{fecha}} a las {{hora}}.',
               'recordatorio_turno', 'approved') returning id`,
      [s.tenantA],
    );

    await c.query("select set_config('request.jwt.claims', '', false)");

    return {
      servicio: sv[0].id,
      c1: c1[0].id,
      c2: c2[0].id,
      c3: c3[0].id,
      t1: t1[0].id,
      t2: t2[0].id,
    };
  });

  servicio = setup.servicio;
  conAmbos = setup.c1;
  soloTelefono = setup.c2;
  sinCanales = setup.c3;
  plantillaEmail = setup.t1;
  plantillaWhatsapp = setup.t2;
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

// ---------------------------------------------------------------------------

describe("cascada de canales", () => {
  it("prefiere el correo, que no cuesta nada", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select app.resolve_channel($1, '{email,whatsapp}'::public.message_channel[]) as canal`,
        [conAmbos],
      );
      expect(rows[0].canal).toBe("email");
    });
  });

  it("baja a WhatsApp cuando no hay correo", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select app.resolve_channel($1, '{email,whatsapp}'::public.message_channel[]) as canal`,
        [soloTelefono],
      );
      expect(rows[0].canal).toBe("whatsapp");
    });
  });

  it("devuelve nada cuando no hay por dónde avisarle", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select app.resolve_channel($1, '{email,whatsapp}'::public.message_channel[]) as canal`,
        [sinCanales],
      );
      expect(rows[0].canal).toBeNull();
    });
  });

  it("una decisión humana manda sobre el orden de la regla", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      await c.query(
        `update public.clients set channel_mode = 'whatsapp' where id = $1`,
        [conAmbos],
      );
      const { rows } = await c.query(
        `select app.resolve_channel($1, '{email,whatsapp}'::public.message_channel[]) as canal`,
        [conAmbos],
      );
      // Tiene correo y la regla lo prefiere, pero alguien decidió WhatsApp.
      expect(rows[0].canal).toBe("whatsapp");
      await c.query("rollback");
    });
  });

  it('quien está en "sin avisos" no recibe nada', async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      await c.query(
        `update public.clients set channel_mode = 'none' where id = $1`,
        [conAmbos],
      );
      const { rows } = await c.query(
        `select app.resolve_channel($1, '{email,whatsapp}'::public.message_channel[]) as canal`,
        [conAmbos],
      );
      expect(rows[0].canal).toBeNull();
      await c.query("rollback");
    });
  });

  it("la baja de un canal lo saltea, la baja total corta todo", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");

      await c.query(
        `insert into public.opt_outs (tenant_id, client_id, channel)
         values ($1, $2, 'email')`,
        [s.tenantA, conAmbos],
      );
      let { rows } = await c.query(
        `select app.resolve_channel($1, '{email,whatsapp}'::public.message_channel[]) as canal`,
        [conAmbos],
      );
      expect(rows[0].canal).toBe("whatsapp");

      await c.query(
        `insert into public.opt_outs (tenant_id, client_id, channel)
         values ($1, $2, null)`,
        [s.tenantA, conAmbos],
      );
      ({ rows } = await c.query(
        `select app.resolve_channel($1, '{email,whatsapp}'::public.message_channel[]) as canal`,
        [conAmbos],
      ));
      expect(rows[0].canal).toBeNull();

      await c.query("rollback");
    });
  });
});

describe("planificador", () => {
  beforeEach(limpiarTodo);

  it("crea un envío por turno y le pone el canal más barato", async () => {
    const regla = await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const id = await crearRegla(
        c,
        { name: "24 horas antes", offset_minutes: -1440 },
        [
          ["email", plantillaEmail],
          ["whatsapp", plantillaWhatsapp],
        ],
      );
      await turnoEn(c, 30, conAmbos);
      await turnoEn(c, 30, soloTelefono);
      await turnoEn(c, 30, sinCanales);
      await c.query("select set_config('request.jwt.claims', '', false)");
      return id;
    });

    const creados = await planificar();
    expect(creados).toBe(3);

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select cl.first_name, j.channel, j.status, j.cost_cents, j.skip_reason
         from public.message_jobs j
         join public.clients cl on cl.id = j.client_id
         where j.rule_id = $1 order by cl.first_name`,
        [regla],
      );

      expect(rows).toHaveLength(3);

      // Tiene los dos: va por correo, que sale cero.
      expect(rows[0]).toMatchObject({
        first_name: "Ambos",
        channel: "email",
        status: "pending",
      });
      expect(Number(rows[0].cost_cents)).toBe(0);

      // Sin canal: queda salteado y explicado, no se pierde en silencio.
      expect(rows[1]).toMatchObject({ first_name: "SinCanal", status: "skipped" });
      expect(rows[1].skip_reason).toContain("ningún canal disponible");

      // Sólo teléfono: WhatsApp, y ahí aparece el costo.
      expect(rows[2]).toMatchObject({
        first_name: "SoloTel",
        channel: "whatsapp",
        status: "pending",
      });
      expect(Number(rows[2].cost_cents)).toBe(3768);
    });

  });

  it("correr dos veces no duplica nada", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await crearRegla(c, { name: "Sin duplicar", offset_minutes: -1440 }, [
        ["email", plantillaEmail],
      ]);
      await turnoEn(c, 30, conAmbos);
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    const primera = await planificar();
    const segunda = await planificar();
    const tercera = await planificar();

    expect(primera).toBeGreaterThan(0);
    expect(segunda).toBe(0);
    expect(tercera).toBe(0);

  });

  it("una regla apagada no planifica nada", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await crearRegla(c, { name: "Apagada", enabled: false }, [
        ["email", plantillaEmail],
      ]);
      await turnoEn(c, 30, conAmbos);
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    expect(await planificar()).toBe(0);
  });

  it("filtra por servicio", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows: otro } = await c.query(
        `insert into public.services
           (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
         values ($1, 'Otro servicio', 30, 20, 'fixed', 100) returning id`,
        [s.tenantA],
      );
      await crearRegla(
        c,
        { name: "Sólo otro servicio", service_ids: `{${otro[0].id}}` },
        [["email", plantillaEmail]],
      );
      await turnoEn(c, 30, conAmbos); // es de Depilación, no del otro
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    expect(await planificar()).toBe(0);
  });

  it('"sólo a quien ya faltó" deja afuera a la clienta impecable', async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await crearRegla(c, { name: "Sólo faltadoras", only_if_missed: true }, [
        ["email", plantillaEmail],
      ]);
      await turnoEn(c, 30, conAmbos);
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    // Todavía no faltó nunca: no le llega nada.
    expect(await planificar()).toBe(0);

    // Se le registra una falta y ahora sí entra.
    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], now() - interval '10 days') as id`,
        [conAmbos, [servicio]],
      );
      await c.query(
        `update public.appointments set status = 'no_show' where id = $1`,
        [rows[0].id],
      );
    });

    expect(await planificar()).toBe(1);
  });

  it("no planifica más allá del horizonte", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await crearRegla(c, { name: "Siete días antes", offset_minutes: -10080 }, [
        ["email", plantillaEmail],
      ]);
      // Turno dentro de 20 días: el aviso sale recién dentro de 13.
      await turnoEn(c, 480, conAmbos);
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    expect(await planificar("72 hours")).toBe(0);
    // Con un horizonte largo sí entra. Esto es lo que el sistema anterior no
    // permitía: recordar con más de una semana de anticipación.
    expect(await planificar("30 days")).toBe(1);

  });

  it("si la estética tiene los envíos frenados, no se planifica", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await crearRegla(c, { name: "Con freno" }, [["email", plantillaEmail]]);
      await turnoEn(c, 30, conAmbos);
      await c.query("select set_config('request.jwt.claims', '', false)");
      await c.query(
        `update public.messaging_settings set sending_enabled = false where tenant_id = $1`,
        [s.tenantA],
      );
    });

    expect(await planificar()).toBe(0);

    await asAdmin(async (c) => {
      await c.query(
        `update public.messaging_settings set sending_enabled = true where tenant_id = $1`,
        [s.tenantA],
      );
    });
  });
});

describe("franja horaria", () => {
  /**
   * Se pide la hora ya formateada por Postgres. Devolver un timestamp sin zona
   * haría que el driver lo interprete en la zona de la máquina que corre las
   * pruebas y la comparación dejaría de significar nada.
   */
  async function corrida(entrada: string): Promise<string> {
    return asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select to_char(
           app.shift_into_window(
             $1::timestamptz, 'America/Argentina/Cordoba',
             '09:00'::time, '21:00'::time
           ) at time zone 'America/Argentina/Cordoba',
           'YYYY-MM-DD HH24:MI'
         ) as cuando`,
        [entrada],
      );
      return rows[0].cuando as string;
    });
  }

  it("corre a la mañana lo que caería de madrugada", async () => {
    expect(await corrida("2026-09-14 06:00:00-03")).toBe("2026-09-14 09:00");
  });

  it("lo que cae de noche espera al día siguiente", async () => {
    expect(await corrida("2026-09-14 23:30:00-03")).toBe("2026-09-15 09:00");
  });

  it("lo que ya cae en horario no se toca", async () => {
    expect(await corrida("2026-09-14 15:20:00-03")).toBe("2026-09-14 15:20");
  });
});

describe("simulador", () => {
  beforeEach(limpiarTodo);

  it("dice a cuánta gente llega, por qué canal y cuánto sale", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await turnoEn(c, 30, conAmbos); // tiene correo: gratis
      await turnoEn(c, 30, soloTelefono); // sólo teléfono: cuesta
      await turnoEn(c, 30, sinCanales); // no hay por dónde
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select channel, recipients, cost_cents
         from public.simulate_rule(
           'before_appointment', -1440,
           '{email,whatsapp}'::public.message_channel[]
         )`,
      );

      const porCanal = Object.fromEntries(
        rows.map((r) => [r.channel ?? "sin_canal", r]),
      );

      expect(Number(porCanal.email.recipients)).toBe(1);
      expect(Number(porCanal.email.cost_cents)).toBe(0);

      expect(Number(porCanal.whatsapp.recipients)).toBe(1);
      expect(Number(porCanal.whatsapp.cost_cents)).toBe(3768);

      // La gente sin canal aparece igual: es el trabajo pendiente de triage.
      expect(Number(porCanal.sin_canal.recipients)).toBe(1);
    });
  });

  it("mandar todo por WhatsApp cuesta el doble que usar la cascada", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await turnoEn(c, 30, conAmbos);
      await turnoEn(c, 30, soloTelefono);
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    await asUser(s.owner, async (c) => {
      const total = async (orden: string) => {
        const { rows } = await c.query(
          `select coalesce(sum(cost_cents), 0)::bigint as total
           from public.simulate_rule(
             'before_appointment', -1440, $1::public.message_channel[]
           )`,
          [orden],
        );
        return Number(rows[0].total);
      };

      expect(await total("{email,whatsapp}")).toBe(3768);
      expect(await total("{whatsapp}")).toBe(7536);
    });
  });

  it("no ve nada de la estética vecina", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await turnoEn(c, 30, conAmbos);
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(
        `select coalesce(sum(recipients), 0)::bigint as total
         from public.simulate_rule(
           'before_appointment', -1440,
           '{email,whatsapp}'::public.message_channel[]
         )`,
      );
      expect(Number(rows[0].total)).toBe(0);
    });
  });
});
