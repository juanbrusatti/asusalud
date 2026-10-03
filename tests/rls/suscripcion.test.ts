import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * La suscripción: 30 días gratis, después $10.000 cada 30 días, 5 de gracia y
 * suspensión sin perder datos.
 *
 * Las fechas se mueven a mano sobre `billing_settings` en vez de esperar: lo
 * que se prueba es la regla, no el reloj.
 */

let s: Scenario;
const sueltos: string[] = [];

async function negocioNuevo(c: PoolClient, nombre: string): Promise<string> {
  const { rows } = await c.query(
    `insert into public.tenants (name, slug)
     values ($1, 'sus-' || substr(md5(random()::text), 1, 10)) returning id`,
    [nombre],
  );
  sueltos.push(rows[0].id);
  return rows[0].id as string;
}

/** Corre el reloj: deja el pagado hasta `dias` días atrás (negativo = futuro). */
async function vencido(c: PoolClient, tenant: string, dias: number) {
  await c.query(
    `update public.billing_settings
        set trial_ends_at = now() - interval '40 days',
            paid_until = now() - make_interval(days => $2)
      where tenant_id = $1`,
    [tenant, dias],
  );
}

async function estado(c: PoolClient, tenant: string) {
  const { rows } = await c.query(`select app.estado_suscripcion($1) as e`, [tenant]);
  return rows[0].e as Record<string, unknown>;
}

beforeAll(async () => {
  s = await setupScenario("sus");
});

afterAll(async () => {
  await asAdmin(async (c) => {
    for (const id of sueltos) {
      await c.query(`delete from public.message_jobs where tenant_id = $1`, [id]);
      await c.query(`delete from public.clients where tenant_id = $1`, [id]);
      await c.query(`delete from public.tenants where id = $1`, [id]);
    }
    await c.query(`delete from public.subscription_payments where tenant_id = $1`, [s.tenantA]);
  });
  await teardownScenario(s);
});

describe("una cuenta nueva", () => {
  it("nace con 30 días de prueba y el abono de $10.000", async () => {
    const e = await asAdmin(async (c) => estado(c, await negocioNuevo(c, "Recién Creada")));

    expect(e.plan).toBe("suscripcion");
    expect(e.estado).toBe("prueba");
    expect(e.abono_cents).toBe(1_000_000);

    const dias = (new Date(e.prueba_hasta as string).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(29.9);
    expect(dias).toBeLessThan(30.1);
  });

  it("no la toca el cobro de meses vencidos", async () => {
    // Si no, el mismo servicio se cobraría dos veces: el ciclo por
    // adelantado y el mes calendario con turnos.
    const n = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "Sin Doble Cobro");
      const { rows } = await c.query(
        `select count(*)::int as n from app.billable_periods($1)`, [t],
      );
      return rows[0].n as number;
    });
    expect(n).toBe(0);
  });
});

describe("el vencimiento", () => {
  it("al vencer hay cinco días para pagar, y la cuenta sigue andando", async () => {
    const r = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "En Gracia");
      await vencido(c, t, 1);
      const accion = (await c.query(`select app.aplicar_suspension($1) as a`, [t])).rows[0].a;
      const status = (await c.query(`select status from public.tenants where id = $1`, [t])).rows[0].status;
      return { e: await estado(c, t), accion, status };
    });

    expect(r.e.estado).toBe("a_pagar");
    expect(r.accion).toBe("sin_cambios");
    expect(r.status).toBe("active");
  });

  it("pasados los cinco días se suspende y frena lo que estaba en la cola", async () => {
    const r = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "Para Suspender");
      const cli = (await c.query(
        `insert into public.clients (tenant_id, first_name) values ($1, 'Clienta') returning id`, [t],
      )).rows[0].id;
      await c.query(
        `insert into public.message_jobs (tenant_id, client_id, scheduled_for, dedupe_key)
         values ($1, $2, now() + interval '1 day', $3)`,
        [t, cli, `sus-test-${t}`],
      );
      await vencido(c, t, 6);
      const accion = (await c.query(`select app.aplicar_suspension($1) as a`, [t])).rows[0].a;
      const status = (await c.query(`select status from public.tenants where id = $1`, [t])).rows[0].status;
      const job = (await c.query(
        `select status::text, skip_reason from public.message_jobs where tenant_id = $1`, [t],
      )).rows[0];
      const clientes = (await c.query(
        `select count(*)::int as n from public.clients where tenant_id = $1`, [t],
      )).rows[0].n;
      return { e: await estado(c, t), accion, status, job, clientes };
    });

    expect(r.e.estado).toBe("suspendida");
    expect(r.accion).toBe("suspendida");
    expect(r.status).toBe("suspended");
    expect(r.job.status).toBe("skipped");
    expect(r.job.skip_reason).toContain("suspendida");
    // Sin perder datos.
    expect(r.clientes).toBe(1);
  });

  it("una cuenta en acuerdo no se suspende sola", async () => {
    // Los negocios que existían antes de la suscripción, como Asusalud.
    const r = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "Con Acuerdo");
      await c.query(`update public.billing_settings set plan = 'acuerdo' where tenant_id = $1`, [t]);
      await vencido(c, t, 60);
      const accion = (await c.query(`select app.aplicar_suspension($1) as a`, [t])).rows[0].a;
      const status = (await c.query(`select status from public.tenants where id = $1`, [t])).rows[0].status;
      return { e: await estado(c, t), accion, status };
    });

    expect(r.e.estado).toBe("acuerdo");
    expect(r.accion).toBe("sin_cambios");
    expect(r.status).toBe("active");
  });
});

describe("pagar", () => {
  it("pagando en la gracia, el ciclo nuevo arranca donde terminaba el viejo", async () => {
    // Pagar dos días tarde no regala dos días.
    const r = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "Paga en Gracia");
      await vencido(c, t, 2);
      const antes = (await c.query(`select paid_until from public.billing_settings where tenant_id = $1`, [t])).rows[0].paid_until;
      const p = (await c.query(
        `select app.registrar_pago_suscripcion($1, 1000000, 'manual') as r`, [t],
      )).rows[0].r;
      return { antes: new Date(antes).getTime(), p };
    });

    expect(r.p.ok).toBe(true);
    expect(new Date(r.p.cubre_desde).getTime()).toBe(r.antes);
    expect(new Date(r.p.cubre_hasta).getTime() - r.antes).toBe(30 * 86_400_000);
  });

  it("pagando suspendida, vuelve en el acto y el ciclo arranca hoy", async () => {
    const r = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "Vuelve");
      await vencido(c, t, 20);
      await c.query(`select app.aplicar_suspension($1)`, [t]);
      const p = (await c.query(
        `select app.registrar_pago_suscripcion($1, 1000000, 'manual') as r`, [t],
      )).rows[0].r;
      const status = (await c.query(`select status from public.tenants where id = $1`, [t])).rows[0].status;
      return { p, status, e: await estado(c, t) };
    });

    expect(r.status).toBe("active");
    expect(r.e.estado).toBe("activa");
    // No se cobran los días sin servicio.
    expect(Math.abs(new Date(r.p.cubre_desde).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("una cuenta suspendida a mano no vuelve sola porque alguien pagó", async () => {
    const status = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "Suspendida a Mano");
      await c.query(`update public.tenants set status = 'suspended' where id = $1`, [t]);
      await vencido(c, t, -10);
      await c.query(`select app.registrar_pago_suscripcion($1, 1000000, 'manual')`, [t]);
      return (await c.query(`select status from public.tenants where id = $1`, [t])).rows[0].status;
    });
    expect(status).toBe("suspended");
  });

  it("el mismo pago de Mercado Pago no extiende dos veces", async () => {
    const r = await asAdmin(async (c) => {
      const t = await negocioNuevo(c, "Mercado Pago");
      const ref = `sus:${t}:2026-11-02`;
      const a = (await c.query(
        `select public.rpc_mercadopago_suscripcion($1, 'mp-123', 1000000) as r`, [ref],
      )).rows[0].r;
      const b = (await c.query(
        `select public.rpc_mercadopago_suscripcion($1, 'mp-123', 1000000) as r`, [ref],
      )).rows[0].r;
      const n = (await c.query(
        `select count(*)::int as n from public.subscription_payments where tenant_id = $1`, [t],
      )).rows[0].n;
      return { a, b, n };
    });

    expect(r.a.ok).toBe(true);
    expect(r.b.repetido).toBe(true);
    expect(r.n).toBe(1);
  });
});

describe("quién ve qué", () => {
  it("el equipo ve el estado y sólo la dueña ve los pagos", async () => {
    await asAdmin(async (c) => {
      await c.query(`select app.registrar_pago_suscripcion($1, 1000000, 'manual')`, [s.tenantA]);
    });

    const dueña = await asUser(s.owner, async (c) =>
      (await c.query(`select public.suscripcion_estado($1) as e`, [s.tenantA])).rows[0].e);
    const staff = await asUser(s.staff, async (c) =>
      (await c.query(`select public.suscripcion_estado($1) as e`, [s.tenantA])).rows[0].e);
    const otro = await asUser(s.intruder, async (c) =>
      (await c.query(`select public.suscripcion_estado($1) as e`, [s.tenantA])).rows[0].e);

    expect(dueña.pagos).toHaveLength(1);
    expect(staff.estado).toBeTruthy();
    expect(staff.pagos).toHaveLength(0);
    expect(otro).toBeNull();
  });

  it("sólo Dlay registra pagos a mano", async () => {
    const r = await asUser(s.owner, async (c) =>
      (await c.query(
        `select public.platform_pago_suscripcion($1, 1000000) as r`, [s.tenantA],
      )).rows[0].r);
    expect(r.ok).toBe(false);
  });
});
