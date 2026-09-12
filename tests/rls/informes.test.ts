import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * El informe es una sola función que contesta seis preguntas. Lo que se prueba
 * acá no es que sepa sumar, sino que sume lo que corresponde: el período
 * correcto, la estética correcta y con las anulaciones ya descontadas.
 */

let s: Scenario;
let branchA: string;
let tz: string;
/** Hoy en la zona horaria de la estética, que es el día que ve la pantalla. */
let hoy: string;

type Report = {
  money: {
    incomeCents: number;
    expenseCents: number;
    byMethod: Array<{ method: string; cents: number }>;
  };
  agenda: {
    total: number;
    attended: number;
    noShow: number;
    cancelled: number;
    upcoming: number;
    online: number;
    bookedMinutes: number;
  };
  openMinutes: number;
  services: Array<{ name: string; count: number; revenueCents: number }>;
  reminders: {
    withReminder: { total: number; noShows: number };
    without: { total: number; noShows: number };
  };
  messages: { sent: number; costCents: number };
};

async function informe(
  c: PoolClient,
  desde = hoy,
  hasta = hoy,
): Promise<Report> {
  const { rows } = await c.query(
    `select public.report_period($1::date, $2::date) as r`,
    [desde, hasta],
  );
  return rows[0].r as Report;
}

/**
 * Un turno con sus servicios, en una sola transacción.
 *
 * Tiene que ser así: las verificaciones de la agenda son triggers diferidos,
 * y un turno sin servicios insertado solo no sobrevive al COMMIT.
 */
async function crearTurno(
  c: PoolClient,
  opciones: {
    clientId: string;
    servicios: Array<{ id: string; minutos: number; precio: number }>;
    hora: number;
    status: string;
  },
): Promise<string> {
  const minutos = opciones.servicios.reduce((t, sv) => t + sv.minutos, 0);

  await c.query("begin");
  const { rows } = await c.query(
    `insert into public.appointments
       (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until, status)
     values (
       $1, $2, $3,
       (date_trunc('day', now() at time zone $5) + make_interval(hours => $6)) at time zone $5,
       (date_trunc('day', now() at time zone $5) + make_interval(hours => $6, mins => $4)) at time zone $5,
       (date_trunc('day', now() at time zone $5) + make_interval(hours => $6, mins => $4)) at time zone $5,
       $7::public.appointment_status
     )
     returning id`,
    [
      s.tenantA,
      branchA,
      opciones.clientId,
      minutos,
      tz,
      opciones.hora,
      opciones.status,
    ],
  );
  const turno = rows[0].id as string;

  for (const [i, sv] of opciones.servicios.entries()) {
    await c.query(
      `insert into public.appointment_services
         (tenant_id, appointment_id, service_id, duration_minutes, buffer_minutes, price_cents, position)
       values ($1, $2, $3, $4, 0, $5, $6)`,
      [s.tenantA, turno, sv.id, sv.minutos, sv.precio, i],
    );
  }
  await c.query("commit");

  return turno;
}

beforeAll(async () => {
  s = await setupScenario("inf");

  await asAdmin(async (c) => {
    const { rows: b } = await c.query(
      `select b.id, t.timezone from public.branches b
       join public.tenants t on t.id = b.tenant_id
       where b.tenant_id = $1 and b.is_default`,
      [s.tenantA],
    );
    branchA = b[0].id as string;
    tz = b[0].timezone as string;

    const { rows: d } = await c.query(
      `select (now() at time zone $1)::date::text as hoy`,
      [tz],
    );
    hoy = d[0].hoy as string;

    // Un solo horario, el de hoy, para que la ocupación tenga un denominador
    // que no dependa del día de la semana en que corran las pruebas.
    await c.query(`delete from public.business_hours where tenant_id = $1`, [
      s.tenantA,
    ]);
    await c.query(
      `insert into public.business_hours (tenant_id, branch_id, weekday, opens_at, closes_at)
       values ($1, $2, extract(dow from now() at time zone $3)::smallint, '09:00', '18:00')`,
      [s.tenantA, branchA, tz],
    );

    const { rows: sv } = await c.query(
      `insert into public.services (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Masaje inf', 60, 5, 'fixed', 350000),
              ($1, 'Perfilado inf', 30, 5, 'fixed', 120000)
       returning id, name`,
      [s.tenantA],
    );
    const masaje = sv.find((r) => r.name === "Masaje inf")!.id as string;
    const perfilado = sv.find((r) => r.name === "Perfilado inf")!.id as string;

    const { rows: cl } = await c.query(
      `insert into public.clients (tenant_id, first_name)
       values ($1, 'Ana'), ($1, 'Bea'), ($1, 'Cari')
       returning id`,
      [s.tenantA],
    );

    const atendido = await crearTurno(c, {
      clientId: cl[0].id,
      servicios: [{ id: masaje, minutos: 60, precio: 350000 }],
      hora: 10,
      status: "attended",
    });
    const atendidoSinAviso = await crearTurno(c, {
      clientId: cl[1].id,
      servicios: [{ id: perfilado, minutos: 30, precio: 120000 }],
      hora: 11,
      status: "attended",
    });
    const ausente = await crearTurno(c, {
      clientId: cl[2].id,
      servicios: [{ id: masaje, minutos: 60, precio: 350000 }],
      hora: 12,
      status: "no_show",
    });
    await crearTurno(c, {
      clientId: cl[0].id,
      servicios: [{ id: masaje, minutos: 60, precio: 350000 }],
      hora: 15,
      status: "confirmed",
    });

    // Dos de los tres turnos cumplidos recibieron aviso. El tercero no: es el
    // grupo de control contra el que se compara el ausentismo.
    await c.query(
      `insert into public.message_jobs
         (tenant_id, client_id, appointment_id, channel, scheduled_for, status, sent_at, cost_cents, dedupe_key)
       values
         ($1, $2, $3, 'whatsapp', now(), 'sent', now(), 3768, 'inf-1'),
         ($1, $4, $5, 'email',    now(), 'sent', now(), 0,    'inf-2'),
         -- De prueba: no salió de verdad, así que no cuenta ni como aviso ni
         -- como gasto.
         ($1, $6, $7, 'whatsapp', now(), 'sent', now(), 3768, 'inf-3')`,
      [
        s.tenantA,
        cl[0].id,
        atendido,
        cl[2].id,
        ausente,
        cl[1].id,
        atendidoSinAviso,
      ],
    );
    await c.query(
      `update public.message_jobs set was_test = true where dedupe_key = 'inf-3'`,
    );
  });

  // Los cobros van como la dueña, que es quien los carga en la vida real.
  await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: s.owner, role: "authenticated" }),
    ]);
    const { rows: caja } = await c.query(
      `insert into public.cash_sessions (tenant_id, branch_id, opening_cents)
       values ($1, $2, 0) returning id`,
      [s.tenantA, branchA],
    );

    await c.query(
      `insert into public.cash_movements
         (tenant_id, branch_id, session_id, kind, method, amount_cents, concept)
       values ($1, $2, $3, 'income',  'cash',     350000, 'Masaje'),
              ($1, $2, $3, 'income',  'transfer', 120000, 'Perfilado'),
              ($1, $2, $3, 'expense', 'cash',      50000, 'Algodón')`,
      [s.tenantA, branchA, caja[0].id],
    );

    const { rows: error } = await c.query(
      `insert into public.cash_movements
         (tenant_id, branch_id, session_id, kind, method, amount_cents, concept)
       values ($1, $2, $3, 'income', 'cash', 100000, 'Cobro mal cargado')
       returning id`,
      [s.tenantA, branchA, caja[0].id],
    );
    await c.query(`select public.cash_reverse_movement($1, 'Me equivoqué')`, [
      error[0].id,
    ]);

    await c.query("select set_config('request.jwt.claims', '', false)");
  });
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

// ---------------------------------------------------------------------------

describe("la plata del período", () => {
  it("separa lo que entró de lo que salió", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      // 3.500 + 1.200 + 1.000 mal cargados
      expect(r.money.incomeCents).toBe(570000);
      // 500 de algodón + los 1.000 que devolvió la anulación
      expect(r.money.expenseCents).toBe(150000);
    });
  });

  it("un cobro anulado no infla el total por medio de pago", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      const porMedio = Object.fromEntries(
        r.money.byMethod.map((m) => [m.method, m.cents]),
      );
      // 3.500 cobrados − 500 de gasto. Los 1.000 mal cargados entraron y
      // volvieron a salir: el informe no los cuenta dos veces ni una.
      expect(porMedio.cash).toBe(300000);
      expect(porMedio.transfer).toBe(120000);
    });
  });

  it("un período sin movimientos da cero, no un error", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c, "2020-01-01", "2020-01-31");
      expect(r.money.incomeCents).toBe(0);
      expect(r.agenda.total).toBe(0);
      expect(r.services).toEqual([]);
    });
  });
});

describe("la agenda del período", () => {
  it("cuenta cada turno según cómo terminó", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      expect(r.agenda.total).toBe(4);
      expect(r.agenda.attended).toBe(2);
      expect(r.agenda.noShow).toBe(1);
      expect(r.agenda.cancelled).toBe(0);
      expect(r.agenda.upcoming).toBe(1);
    });
  });

  it("mide la ocupación contra los horarios de atención", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      expect(r.agenda.bookedMinutes).toBe(210); // 60 + 30 + 60 + 60
      expect(r.openMinutes).toBe(540); // de 9 a 18
    });
  });

  it("un turno cancelado no ocupa la agenda", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `update public.appointments
         set status = 'cancelled', cancelled_at = now()
         where tenant_id = $1 and status = 'confirmed'`,
        [s.tenantA],
      );
    });

    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      expect(r.agenda.cancelled).toBe(1);
      expect(r.agenda.bookedMinutes).toBe(150);
    });

    await asAdmin(async (c) => {
      await c.query(
        `update public.appointments set status = 'confirmed', cancelled_at = null
         where tenant_id = $1 and status = 'cancelled'`,
        [s.tenantA],
      );
    });
  });
});

describe("qué servicio deja más", () => {
  it("ordena por lo facturado y sólo cuenta los turnos atendidos", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      expect(r.services.map((x) => x.name)).toEqual([
        "Masaje inf",
        "Perfilado inf",
      ]);
      // El otro masaje del día fue una ausencia: no facturó nada.
      expect(r.services[0]).toMatchObject({ count: 1, revenueCents: 350000 });
      expect(r.services[1]).toMatchObject({ count: 1, revenueCents: 120000 });
    });
  });
});

describe("si sirven los recordatorios", () => {
  it("compara turnos avisados contra turnos sin avisar", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      // Avisados: el atendido y el ausente. Sin avisar: el otro atendido.
      expect(r.reminders.withReminder).toEqual({ total: 2, noShows: 1 });
      expect(r.reminders.without).toEqual({ total: 1, noShows: 0 });
    });
  });

  it("un envío de prueba no cuenta como aviso ni como gasto", async () => {
    await asUser(s.owner, async (c) => {
      const r = await informe(c);
      expect(r.messages.sent).toBe(2);
      expect(r.messages.costCents).toBe(3768);
    });
  });
});

describe("quién ve qué", () => {
  it("la estética de al lado no aparece en el informe", async () => {
    await asUser(s.intruder, async (c) => {
      const r = await informe(c);
      expect(r.money.incomeCents).toBe(0);
      expect(r.agenda.total).toBe(0);
      expect(r.services).toEqual([]);
    });
  });

  it("una profesional ve la agenda pero no la plata", async () => {
    await asUser(s.staff, async (c) => {
      const r = await informe(c);
      expect(r.agenda.total).toBe(4);
      // La RLS de la caja la deja afuera: recibe ceros, no un error.
      expect(r.money.incomeCents).toBe(0);
      expect(r.money.byMethod).toEqual([]);
    });
  });
});

describe("períodos imposibles", () => {
  it("rechaza un período que termina antes de empezar", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(`select public.report_period('2026-03-10', '2026-03-01')`),
      );
      expect(code).toBe("22007");
    });
  });

  it("rechaza un período de más de un año", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(`select public.report_period('2020-01-01', '2026-01-01')`),
      );
      expect(code).toBe("22023");
    });
  });
});
