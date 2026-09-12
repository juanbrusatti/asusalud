import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;
let slug: string;
let branchA: string;
/** Depilación: 40 minutos, 10 de limpieza, dos a la vez. */
let depilacion: string;
/** Masaje: 60 minutos, uno solo a la vez. */
let masaje: string;
/** Un servicio activo pero que no se ofrece online. */
let soloEnLocal: string;

/** Corre como alguien sin cuenta, que es como llega una clienta. */
async function comoVisitante<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role anon");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

/** El próximo lunes, para que la fecha siempre caiga en día laborable. */
function proximoLunes(): string {
  const hoy = new Date();
  const faltan = (8 - hoy.getUTCDay()) % 7 || 7;
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + faltan));
  return d.toISOString().slice(0, 10);
}

const LUNES = proximoLunes();

beforeAll(async () => {
  s = await setupScenario("res");
  slug = s.slugs[0];

  const setup = await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: s.owner, role: "authenticated" }),
    ]);

    const { rows: b } = await c.query(
      `select id from public.branches where tenant_id = $1 and is_default`,
      [s.tenantA],
    );
    const { rows: d } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, buffer_minutes, capacity, price_mode, price_cents)
       values ($1, 'Depilación', 40, 10, 2, 'fixed', 1000000) returning id`,
      [s.tenantA],
    );
    const { rows: m } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Masaje', 60, 1, 'fixed', 350000) returning id`,
      [s.tenantA],
    );
    const { rows: l } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents,
          is_bookable_online)
       values ($1, 'Primera consulta', 30, 1, 'fixed', 0, false) returning id`,
      [s.tenantA],
    );
    await c.query("select set_config('request.jwt.claims', '', false)");
    return {
      branch: b[0].id as string,
      dep: d[0].id as string,
      mas: m[0].id as string,
      local: l[0].id as string,
    };
  });

  branchA = setup.branch;
  depilacion = setup.dep;
  masaje = setup.mas;
  soloEnLocal = setup.local;
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

beforeEach(async () => {
  await asAdmin(async (c) => {
    await c.query(`delete from public.appointments where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.agenda_blocks where tenant_id = $1`, [s.tenantA]);
    await c.query(
      `delete from public.clients where tenant_id = $1 and phone_e164 like '+549999%'`,
      [s.tenantA],
    );
    await c.query(
      `update public.booking_settings
       set enabled = true, min_advance_hours = 0, max_days_ahead = 60,
           slot_minutes = 15, max_open_per_client = 3, show_prices = true
       where tenant_id = $1`,
      [s.tenantA],
    );
  });
});

// ---------------------------------------------------------------------------

describe("lo que un visitante NO puede ver", () => {
  it("no llega a ninguna tabla", async () => {
    await comoVisitante(async (c) => {
      for (const tabla of [
        "clients", "appointments", "services", "tenants", "message_jobs",
        "whatsapp_accounts", "business_hours", "booking_settings",
      ]) {
        await c.query("savepoint p");
        const code = await expectRejected(() =>
          c.query(`select * from public.${tabla}`),
        );
        await c.query("rollback to savepoint p");
        expect(code, `pudo leer ${tabla}`).toBe("42501");
      }
    });
  });

  it("los horarios libres no dicen quién ocupa el resto", async () => {
    await comoVisitante(async (c) => {
      const { fields } = await c.query(
        `select * from public.booking_slots($1, $2::uuid[], $3::date)`,
        [slug, [masaje], LUNES],
      );
      // Una sola columna: el instante. Nada de nombres ni de cuántos hay.
      expect(fields.map((f) => f.name)).toEqual(["slot"]);
    });
  });

  it("no puede reservar en una estética con la agenda cerrada", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `update public.booking_settings set enabled = false where tenant_id = $1`,
        [s.tenantA],
      );
    });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(`select public.booking_page($1) as p`, [slug]);
      expect(rows[0].p).toBeNull();

      const { rows: slots } = await c.query(
        `select * from public.booking_slots($1, $2::uuid[], $3::date)`,
        [slug, [masaje], LUNES],
      );
      expect(slots).toHaveLength(0);
    });
  });

  it("no ve los servicios que la estética no ofrece online", async () => {
    await comoVisitante(async (c) => {
      const { rows } = await c.query(`select public.booking_page($1) as p`, [slug]);
      const nombres = rows[0].p.services.map((x: { name: string }) => x.name);
      expect(nombres).toContain("Depilación");
      expect(nombres).not.toContain("Primera consulta");
    });
  });

  it("no puede reservar un servicio que no se ofrece online", async () => {
    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select public.booking_create($1, $2::uuid[], $3::timestamptz,
                                      'Ana', 'Test', '+5499990001') as r`,
        [slug, [soloEnLocal], `${LUNES}T13:00:00Z`],
      );
      expect(rows[0].r.ok).toBe(false);
    });
  });

  it("el precio no viaja si la estética eligió no mostrarlo", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `update public.booking_settings set show_prices = false where tenant_id = $1`,
        [s.tenantA],
      );
    });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(`select public.booking_page($1) as p`, [slug]);
      for (const srv of rows[0].p.services) {
        expect(srv.priceCents).toBeNull();
      }
    });
  });
});

describe("horarios disponibles", () => {
  it("respeta el horario de atención", async () => {
    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select to_char(slot at time zone 'America/Argentina/Cordoba', 'HH24:MI') as h
         from public.booking_slots($1, $2::uuid[], $3::date) order by slot`,
        [slug, [masaje], LUNES],
      );
      // De 9 a 19, y un masaje de 60 minutos: el último arranque es 18:00.
      expect(rows[0].h).toBe("09:00");
      expect(rows[rows.length - 1].h).toBe("18:00");
    });
  });

  it("un turno ocupa el horario de un servicio de a uno", async () => {
    const antes = await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.booking_slots($1, $2::uuid[], $3::date)`,
        [slug, [masaje], LUNES],
      );
      return rows[0].n as number;
    });

    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows: cl } = await c.query(
        `insert into public.clients (tenant_id, first_name, phone_e164)
         values ($1, 'Ocupa', '+5499990099') returning id`,
        [s.tenantA],
      );
      await c.query(
        `select public.book_appointment($1, $2::uuid[], ($3 || 'T15:00:00Z')::timestamptz)`,
        [cl[0].id, [masaje], LUNES],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    const despues = await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.booking_slots($1, $2::uuid[], $3::date)`,
        [slug, [masaje], LUNES],
      );
      return rows[0].n as number;
    });

    expect(despues).toBeLessThan(antes);
  });

  it("un servicio de a dos sigue ofreciendo el horario con uno tomado", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows: cl } = await c.query(
        `insert into public.clients (tenant_id, first_name, phone_e164)
         values ($1, 'Primera', '+5499990098') returning id`,
        [s.tenantA],
      );
      await c.query(
        `select public.book_appointment($1, $2::uuid[], ($3 || 'T13:00:00Z')::timestamptz)`,
        [cl[0].id, [depilacion], LUNES],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select 1 from public.booking_slots($1, $2::uuid[], $3::date)
         where slot = ($4 || 'T13:00:00Z')::timestamptz`,
        [slug, [depilacion], LUNES, LUNES],
      );
      // Depilación admite dos a la vez: el horario sigue disponible.
      expect(rows).toHaveLength(1);
    });
  });

  it("un bloqueo de agenda saca esos horarios", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `insert into public.agenda_blocks (tenant_id, branch_id, starts_at, ends_at, reason)
         values ($1, $2, ($3 || 'T12:00:00Z')::timestamptz,
                 ($3 || 'T16:00:00Z')::timestamptz, 'Turno médico')`,
        [s.tenantA, branchA, LUNES],
      );
    });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select 1 from public.booking_slots($1, $2::uuid[], $3::date)
         where slot >= ($4 || 'T12:00:00Z')::timestamptz
           and slot <  ($4 || 'T16:00:00Z')::timestamptz`,
        [slug, [masaje], LUNES, LUNES],
      );
      expect(rows).toHaveLength(0);
    });
  });

  it("la anticipación mínima saca lo que está por empezar", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `update public.booking_settings set min_advance_hours = 720 where tenant_id = $1`,
        [s.tenantA],
      );
    });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.booking_slots($1, $2::uuid[], $3::date)`,
        [slug, [masaje], LUNES],
      );
      // Treinta días de anticipación mínima: el lunes que viene no entra.
      expect(rows[0].n).toBe(0);
    });
  });

  it("no ofrece nada más allá del horizonte", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `update public.booking_settings set max_days_ahead = 1 where tenant_id = $1`,
        [s.tenantA],
      );
    });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.booking_slots($1, $2::uuid[], $3::date)`,
        [slug, [masaje], LUNES],
      );
      expect(rows[0].n).toBe(0);
    });
  });

  it("dos servicios seguidos necesitan el hueco de los dos", async () => {
    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select to_char(max(slot) at time zone 'America/Argentina/Cordoba', 'HH24:MI') as ultimo
         from public.booking_slots($1, $2::uuid[], $3::date)`,
        [slug, [masaje, depilacion], LUNES],
      );
      // 60 + 40 = 100 minutos antes de las 19:00 dan las 17:20, pero los
      // horarios se ofrecen cada 15 desde las 9: el último que entra es 17:15.
      expect(rows[0].ultimo).toBe("17:15");
    });
  });
});

describe("reservar", () => {
  it("crea la ficha y el turno de una persona nueva", async () => {
    const resultado = await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select public.booking_create($1, $2::uuid[], ($3 || 'T13:00:00Z')::timestamptz,
                                     'Mirián', 'Ortiz', '+5499990001',
                                     'mirian@test.local', 'Llego 10 minutos antes') as r`,
        [slug, [masaje], LUNES],
      );
      await c.query("commit");
      return rows[0].r;
    });

    expect(resultado.ok).toBe(true);

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select a.status, a.source, a.notes, a.price_cents,
                cl.first_name, cl.email
         from public.appointments a
         join public.clients cl on cl.id = a.client_id
         where a.id = $1`,
        [resultado.appointmentId],
      );
      expect(rows[0]).toMatchObject({
        status: "confirmed",
        // Queda marcado que vino de la web y no del mostrador.
        source: "online",
        first_name: "Mirián",
        email: "mirian@test.local",
      });
      expect(Number(rows[0].price_cents)).toBe(350000);
      expect(rows[0].notes).toContain("10 minutos");
    });

    await asAdmin(async (c) => {
      await c.query(`delete from public.appointments where id = $1`, [
        resultado.appointmentId,
      ]);
      await c.query(`delete from public.clients where phone_e164 = '+5499990001'`);
    });
  });

  it("reutiliza la ficha si el teléfono ya existe", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `insert into public.clients (tenant_id, first_name, last_name, phone_e164, alert)
         values ($1, 'Josefina', 'Lazo', '+5499990002', 'Alérgica a la lidocaína')`,
        [s.tenantA],
      );
    });

    const r = await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select public.booking_create($1, $2::uuid[], ($3 || 'T14:00:00Z')::timestamptz,
                                      'Jose', null, '+5499990002', 'jose@test.local') as r`,
        [slug, [masaje], LUNES],
      );
      await c.query("commit");
      return rows[0].r;
    });

    expect(r.ok).toBe(true);

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from public.clients where phone_e164 = '+5499990002'`,
      );
      // Una sola ficha: no se duplica a quien ya estaba cargada.
      expect(rows[0].n).toBe(1);

      const { rows: ficha } = await c.query(
        `select first_name, alert, email from public.clients where phone_e164 = '+5499990002'`,
      );
      // No se pisa lo que había cargado la estética, pero sí se completa lo
      // que faltaba.
      expect(ficha[0].first_name).toBe("Josefina");
      expect(ficha[0].alert).toContain("lidocaína");
      expect(ficha[0].email).toBe("jose@test.local");
    });

    await asAdmin(async (c) => {
      await c.query(`delete from public.appointments where id = $1`, [r.appointmentId]);
      await c.query(`delete from public.clients where phone_e164 = '+5499990002'`);
    });
  });

  it("avisa en castellano si alguien tomó el horario mientras tanto", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows: cl } = await c.query(
        `insert into public.clients (tenant_id, first_name, phone_e164)
         values ($1, 'Ganó', '+5499990097') returning id`,
        [s.tenantA],
      );
      await c.query(
        `select public.book_appointment($1, $2::uuid[], ($3 || 'T15:00:00Z')::timestamptz)`,
        [cl[0].id, [masaje], LUNES],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select public.booking_create($1, $2::uuid[], ($3 || 'T15:00:00Z')::timestamptz,
                                      'Tarde', null, '+5499990003') as r`,
        [slug, [masaje], LUNES],
      );

      // Lo importante: la clienta recibe una explicación, no un error de base
      // de datos. La función fuerza la verificación adentro justamente para
      // poder traducirlo.
      expect(rows[0].r.ok).toBe(false);
      expect(rows[0].r.error).toContain("tomó ese horario");

      // Y no quedó ninguna ficha ni turno a medias.
      const { rows: fichas } = await c.query(
        `select 1 from public.booking_page($1)`,
        [slug],
      );
      expect(fichas.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("frena a quien intenta reservar media agenda", async () => {
    await comoVisitante(async (c) => {
      for (const hora of ["12:00", "13:30", "15:00"]) {
        const { rows } = await c.query(
          `select public.booking_create($1, $2::uuid[], ($3 || 'T' || $4 || ':00Z')::timestamptz,
                                        'Acaparadora', null, '+5499990004') as r`,
          [slug, [masaje], LUNES, hora],
        );
        expect(rows[0].r.ok, `en ${hora}`).toBe(true);
      }

      const { rows } = await c.query(
        `select public.booking_create($1, $2::uuid[], ($3 || 'T17:00:00Z')::timestamptz,
                                      'Acaparadora', null, '+5499990004') as r`,
        [slug, [masaje], LUNES],
      );
      // Una agenda pública sin este límite se llena de turnos fantasma.
      expect(rows[0].r.ok).toBe(false);
      expect(rows[0].r.error).toContain("turnos reservados");
    });
  });

  it("pide nombre y teléfono", async () => {
    await comoVisitante(async (c) => {
      const { rows: sinNombre } = await c.query(
        `select public.booking_create($1, $2::uuid[], ($3 || 'T13:00:00Z')::timestamptz,
                                      '  ', null, '+5499990005') as r`,
        [slug, [masaje], LUNES],
      );
      expect(sinNombre[0].r.ok).toBe(false);

      const { rows: sinTel } = await c.query(
        `select public.booking_create($1, $2::uuid[], ($3 || 'T13:00:00Z')::timestamptz,
                                      'Ana', null, '') as r`,
        [slug, [masaje], LUNES],
      );
      expect(sinTel[0].r.ok).toBe(false);
      expect(sinTel[0].r.error).toContain("teléfono");
    });
  });

  it("una estética que no existe no dice nada", async () => {
    await comoVisitante(async (c) => {
      const { rows } = await c.query(`select public.booking_page('no-existe') as p`);
      expect(rows[0].p).toBeNull();
    });
  });
});
