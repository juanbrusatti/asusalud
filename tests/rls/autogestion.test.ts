import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * La clienta manejando su propio turno.
 *
 * Lo que se prueba no es que los botones anden, sino que la base sea la que
 * decide: la hora de corte, el tope de cambios y de quién es cada turno tienen
 * que valer aunque alguien llame a las funciones a mano, sin pasar por la
 * pantalla.
 */

let s: Scenario;
let branchA: string;
let tz: string;
let servicio: string;
let cliente: string;

type Resultado = { ok: boolean; error?: string; late?: boolean; limit?: boolean };

/** Un turno nuevo dentro de N horas, con su token. */
async function crearTurno(
  horas = 48,
  status = "confirmed",
): Promise<{ id: string; token: string }> {
  return asAdmin(async (c) => {
    await c.query("begin");
    const { rows } = await c.query(
      `insert into public.appointments
         (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until, status)
       values ($1, $2, $3,
         now() + make_interval(hours => $4),
         now() + make_interval(hours => $4, mins => 40),
         now() + make_interval(hours => $4, mins => 40),
         $5::public.appointment_status)
       returning id, manage_token`,
      [s.tenantA, branchA, cliente, horas, status],
    );
    await c.query(
      `insert into public.appointment_services
         (tenant_id, appointment_id, service_id, duration_minutes, buffer_minutes, price_cents, position)
       values ($1, $2, $3, 40, 0, 350000, 0)`,
      [s.tenantA, rows[0].id, servicio],
    );
    await c.query("commit");
    return { id: rows[0].id as string, token: rows[0].manage_token as string };
  });
}

async function llamar(
  c: PoolClient,
  sql: string,
  params: unknown[],
): Promise<Resultado> {
  const { rows } = await c.query(sql, params);
  return Object.values(rows[0])[0] as Resultado;
}

/**
 * Corre como visitante sin sesión y **sin revertir al final**.
 *
 * `asUser` envuelve todo en una transacción que siempre vuelve atrás, que es
 * lo que hace falta para probar permisos. Pero acá lo que se mira es el efecto
 * —que el turno quede cancelado, que el historial diga quién fue—, y eso hay
 * que leerlo desde otra conexión, después de que el cambio se haya confirmado.
 * La limpieza la hace `beforeEach`.
 */
async function comoVisitante<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return asAdmin(async (c) => {
    await c.query("set role anon");
    try {
      return await fn(c);
    } finally {
      // Sin esto, la conexión vuelve al pool disfrazada de visitante y la
      // prueba siguiente se rompe por un motivo que no tiene nada que ver.
      await c.query("reset role").catch(() => {});
    }
  });
}

beforeAll(async () => {
  s = await setupScenario("aut");

  await asAdmin(async (c) => {
    const { rows: b } = await c.query(
      `select b.id, t.timezone from public.branches b
       join public.tenants t on t.id = b.tenant_id
       where b.tenant_id = $1 and b.is_default`,
      [s.tenantA],
    );
    branchA = b[0].id as string;
    tz = b[0].timezone as string;

    await c.query(
      `update public.booking_settings
       set enabled = true, self_manage = true,
           cancel_min_hours = 24, max_reschedules = 2
       where tenant_id = $1`,
      [s.tenantA],
    );

    // Atención todos los días, así las pruebas no dependen del día en que
    // corran.
    await c.query(`delete from public.business_hours where tenant_id = $1`, [
      s.tenantA,
    ]);
    await c.query(
      `insert into public.business_hours (tenant_id, branch_id, weekday, opens_at, closes_at)
       select $1, $2, d, '00:00', '23:59' from generate_series(0, 6) as d`,
      [s.tenantA, branchA],
    );

    const { rows: sv } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents,
          is_bookable_online)
       values ($1, 'Masaje aut', 40, 1, 'fixed', 350000, true)
       returning id`,
      [s.tenantA],
    );
    servicio = sv[0].id as string;

    const { rows: cl } = await c.query(
      `insert into public.clients (tenant_id, first_name, last_name)
       values ($1, 'Mirián', 'Ortiz') returning id`,
      [s.tenantA],
    );
    cliente = cl[0].id as string;
  });
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

beforeEach(async () => {
  await asAdmin(async (c) => {
    await c.query(`delete from public.appointments where tenant_id = $1`, [
      s.tenantA,
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("el enlace es la llave", () => {
  it("un token inventado no dice si el turno existe o no", async () => {
    await crearTurno();
    await asUser(null, async (c) => {
      const r = await llamar(
        c,
        `select public.booking_manage($1) as r`,
        ["noexisteestetokenparanada00000000"],
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/no encontramos/i);
    });
  });

  it("el token del turno abre ese turno y ninguno más", async () => {
    const uno = await crearTurno(48);
    await crearTurno(72);

    await asUser(null, async (c) => {
      const { rows } = await c.query(
        `select public.booking_manage($1) as r`,
        [uno.token],
      );
      const r = rows[0].r as { ok: boolean; appointment: { startsAt: string } };
      expect(r.ok).toBe(true);
      // Devuelve un turno, no una lista: no hay forma de llegar al otro.
      expect(r.appointment.startsAt).toBeTruthy();
    });
  });

  it("el enlace no entrega la ficha de la clienta", async () => {
    const t = await crearTurno();
    await asUser(null, async (c) => {
      const { rows } = await c.query(
        `select public.booking_manage($1) as r`,
        [t.token],
      );
      const texto = JSON.stringify(rows[0].r);
      // El nombre de pila viaja para reconocer el turno; nada más.
      expect(texto).toContain("Mirián");
      expect(texto).not.toContain("Ortiz");
      expect(texto).not.toContain(cliente);
    });
  });

  it("un visitante sigue sin poder leer los tokens de la tabla", async () => {
    await crearTurno();
    await asUser(null, async (c) => {
      const code = await expectRejected(() =>
        c.query(`select manage_token from public.appointments`),
      );
      expect(code).toBe("42501");
    });
  });
});

describe("cancelar", () => {
  it("la clienta cancela y el horario queda libre", async () => {
    const t = await crearTurno(48);

    await comoVisitante(async (c) => {
      const r = await llamar(c, `select public.booking_cancel($1, $2) as r`, [
        t.token,
        "Me salió un viaje",
      ]);
      expect(r.ok).toBe(true);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select status, cancel_reason from public.appointments where id = $1`,
        [t.id],
      );
      expect(rows[0].status).toBe("cancelled");
      // El motivo queda escrito para que la agenda no tenga que adivinarlo.
      expect(rows[0].cancel_reason).toBe(
        "Cancelado por la clienta: Me salió un viaje",
      );
    });
  });

  it("el historial dice que fue la clienta, no el equipo", async () => {
    const t = await crearTurno(48);
    await comoVisitante(async (c) => {
      await c.query(`select public.booking_cancel($1, null)`, [t.token]);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select by_client, changed_by from public.appointment_status_history
         where appointment_id = $1 and to_status = 'cancelled'`,
        [t.id],
      );
      expect(rows[0].by_client).toBe(true);
      expect(rows[0].changed_by).toBeNull();
    });
  });

  it("faltando menos de la hora de corte ya no se puede sola", async () => {
    const t = await crearTurno(3);
    await asUser(null, async (c) => {
      const r = await llamar(c, `select public.booking_cancel($1, null) as r`, [
        t.token,
      ]);
      expect(r.ok).toBe(false);
      expect(r.late).toBe(true);
      // El mensaje dice cuántas horas son, no un "no se puede" a secas.
      expect(r.error).toContain("24");
    });
  });

  it("con la autogestión apagada el enlace muestra pero no toca", async () => {
    const t = await crearTurno(48);
    await asAdmin((c) =>
      c.query(
        `update public.booking_settings set self_manage = false where tenant_id = $1`,
        [s.tenantA],
      ),
    );

    await asUser(null, async (c) => {
      const vista = await llamar(c, `select public.booking_manage($1) as r`, [
        t.token,
      ]);
      expect(vista.ok).toBe(true);

      const r = await llamar(c, `select public.booking_cancel($1, null) as r`, [
        t.token,
      ]);
      expect(r.ok).toBe(false);
    });

    await asAdmin((c) =>
      c.query(
        `update public.booking_settings set self_manage = true where tenant_id = $1`,
        [s.tenantA],
      ),
    );
  });

  it("un turno ya cancelado no se cancela dos veces", async () => {
    const t = await crearTurno(48);
    await comoVisitante(async (c) => {
      await c.query(`select public.booking_cancel($1, null)`, [t.token]);
      const r = await llamar(c, `select public.booking_cancel($1, null) as r`, [
        t.token,
      ]);
      expect(r.ok).toBe(false);
    });
  });
});

describe("reprogramar", () => {
  it("mueve el turno y deja escrito de dónde venía", async () => {
    const t = await crearTurno(48);

    await comoVisitante(async (c) => {
      const r = await llamar(
        c,
        `select public.booking_reschedule($1, now() + interval '72 hours') as r`,
        [t.token],
      );
      expect(r.ok).toBe(true);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select rescheduled_count,
                extract(epoch from (ends_at - starts_at)) / 60 as minutos
         from public.appointments where id = $1`,
        [t.id],
      );
      expect(rows[0].rescheduled_count).toBe(1);
      // La duración se recalcula desde los servicios del turno.
      expect(Number(rows[0].minutos)).toBe(40);

      const { rows: h } = await c.query(
        `select reason, by_client from public.appointment_status_history
         where appointment_id = $1 and from_status = to_status`,
        [t.id],
      );
      expect(h[0].reason).toMatch(/^Reprogramado por la clienta/);
      expect(h[0].by_client).toBe(true);
    });
  });

  it("no se puede mover más veces que el tope", async () => {
    const t = await crearTurno(48);

    await comoVisitante(async (c) => {
      for (const h of [50, 52]) {
        const r = await llamar(
          c,
          `select public.booking_reschedule($1, now() + make_interval(hours => $2)) as r`,
          [t.token, h],
        );
        expect(r.ok).toBe(true);
      }

      const tercera = await llamar(
        c,
        `select public.booking_reschedule($1, now() + interval '54 hours') as r`,
        [t.token],
      );
      expect(tercera.ok).toBe(false);
      expect(tercera.limit).toBe(true);
    });
  });

  it("no se puede mover encima de otro turno del mismo servicio", async () => {
    const libre = await crearTurno(48);
    const ocupado = await crearTurno(72);

    const tomado = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select starts_at from public.appointments where id = $1`,
        [ocupado.id],
      );
      return rows[0].starts_at as Date;
    });

    await comoVisitante(async (c) => {
      // El servicio admite una sola persona por vez.
      const r = await llamar(
        c,
        `select public.booking_reschedule($1, $2::timestamptz) as r`,
        [libre.token, tomado],
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/tomó ese horario/i);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select rescheduled_count from public.appointments where id = $1`,
        [libre.id],
      );
      // El intento fallido no gastó un cambio.
      expect(rows[0].rescheduled_count).toBe(0);
    });
  });

  it("al buscar horarios el turno no se tapa a sí mismo", async () => {
    const t = await crearTurno(48);

    await asUser(null, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n
         from public.booking_manage_slots($1,
           ((now() + interval '48 hours') at time zone $2)::date)`,
        [t.token, tz],
      );
      // Sin excluirse, el rato que ocupa hoy desaparecería de la lista y no
      // se podría correr media hora.
      expect(rows[0].n).toBeGreaterThan(0);
    });
  });

  it("pasada la hora de corte no se ofrecen horarios", async () => {
    const t = await crearTurno(3);
    await asUser(null, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n
         from public.booking_manage_slots($1,
           ((now() + interval '48 hours') at time zone $2)::date)`,
        [t.token, tz],
      );
      expect(rows[0].n).toBe(0);
    });
  });
});

describe("confirmar", () => {
  it("un turno sin confirmar se confirma desde el enlace", async () => {
    const t = await crearTurno(48, "pending");

    await comoVisitante(async (c) => {
      const r = await llamar(c, `select public.booking_confirm($1) as r`, [
        t.token,
      ]);
      expect(r.ok).toBe(true);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select status from public.appointments where id = $1`,
        [t.id],
      );
      expect(rows[0].status).toBe("confirmed");
    });
  });

  it("uno ya confirmado no se vuelve a confirmar", async () => {
    const t = await crearTurno(48, "confirmed");
    await asUser(null, async (c) => {
      const r = await llamar(c, `select public.booking_confirm($1) as r`, [
        t.token,
      ]);
      expect(r.ok).toBe(false);
    });
  });
});

describe("reservar entrega el enlace", () => {
  it("la respuesta de la reserva trae el token del turno nuevo", async () => {
    const slug = s.slugs[0];

    await comoVisitante(async (c) => {
      const { rows: libres } = await c.query(
        `select slot from public.booking_slots($1, array[$2]::uuid[],
           ((now() + interval '3 days') at time zone $3)::date) limit 1`,
        [slug, servicio, tz],
      );
      expect(libres.length).toBe(1);

      const { rows } = await c.query(
        `select public.booking_create($1, array[$2]::uuid[], $3, 'Nueva', '',
           '+5493584123456') as r`,
        [slug, servicio, libres[0].slot],
      );
      const r = rows[0].r as { ok: boolean; manageToken: string };
      expect(r.ok).toBe(true);
      expect(r.manageToken).toHaveLength(32);

      // Y ese token abre el turno recién creado.
      const vista = await llamar(c, `select public.booking_manage($1) as r`, [
        r.manageToken,
      ]);
      expect(vista.ok).toBe(true);
    });
  });
});

describe("el enlace viaja en los mensajes", () => {
  it("el emisor recibe la dirección del turno armada", async () => {
    const t = await crearTurno(48);

    await asAdmin(async (c) => {
      await c.query(
        `insert into public.platform_settings (key, value)
         values ('site_url', 'https://dlay.app/')
         on conflict (key) do update set value = excluded.value`,
      );
      const { rows: j } = await c.query(
        `insert into public.message_jobs
           (tenant_id, client_id, appointment_id, channel, scheduled_for, dedupe_key)
         values ($1, $2, $3, 'whatsapp', now(), 'aut-link') returning id`,
        [s.tenantA, cliente, t.id],
      );

      const { rows } = await c.query(
        `select * from app.jobs_payload(array[$1]::uuid[])`,
        [j[0].id],
      );

      // La barra sobrante de la dirección no se duplica.
      expect(rows[0].manage_url).toBe(`https://dlay.app/t/${t.token}`);

      // Guardia contra el error de rehacer esta función copiando una versión
      // vieja: estas dos columnas se agregaron después y es fácil perderlas.
      expect(rows[0]).toHaveProperty("quick_replies");
      expect(rows[0].appointment_id).toBe(t.id);

      await c.query(`delete from public.message_jobs where id = $1`, [j[0].id]);
    });
  });

  it("un aviso sin turno no inventa un enlace", async () => {
    await asAdmin(async (c) => {
      const { rows: j } = await c.query(
        `insert into public.message_jobs
           (tenant_id, client_id, channel, scheduled_for, dedupe_key)
         values ($1, $2, 'email', now(), 'aut-sinturno') returning id`,
        [s.tenantA, cliente],
      );

      const { rows } = await c.query(
        `select manage_url from app.jobs_payload(array[$1]::uuid[])`,
        [j[0].id],
      );
      expect(rows[0].manage_url).toBeNull();

      await c.query(`delete from public.message_jobs where id = $1`, [j[0].id]);
    });
  });
});
