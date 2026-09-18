import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * Mover un turno deja rastro.
 *
 * Lo que se prueba no es que sepa cambiar una fecha: es que el rastro lo deje
 * el disparador y no quien mueve. Hoy mueven dos caminos —el enlace del
 * cliente y el mostrador—, y si la cuenta la llevara cada uno, alguno se
 * olvidaría y un turno movido se vería igual que uno intacto.
 */

let s: Scenario;
let branchA: string;
let servicio: string;
let cliente: string;

async function crearTurno(c: PoolClient, horasAdelante: number) {
  const { rows } = await c.query(
    `insert into public.appointments
       (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until,
        status, price_cents)
     values ($1, $2, $3,
             now() + make_interval(hours => $4),
             now() + make_interval(hours => $4, mins => 30),
             now() + make_interval(hours => $4, mins => 30),
             'confirmed', 100000)
     returning id`,
    [s.tenantA, branchA, cliente, horasAdelante],
  );
  await c.query(
    `insert into public.appointment_services
       (tenant_id, appointment_id, service_id, duration_minutes, buffer_minutes,
        price_cents, position)
     values ($1, $2, $3, 30, 0, 100000, 0)`,
    [s.tenantA, rows[0].id, servicio],
  );
  return rows[0].id as string;
}

async function leer(c: PoolClient, id: string) {
  const { rows } = await c.query(
    `select moved_count, moved_at, original_starts_at, starts_at, status
     from public.appointments where id = $1`,
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  s = await setupScenario("mov");

  await asAdmin(async (c) => {
    const { rows: b } = await c.query(
      `select b.id from public.branches b
       where b.tenant_id = $1 and b.is_default`,
      [s.tenantA],
    );
    branchA = b[0].id as string;

    const { rows: sv } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Servicio mov', 30, 50, 'fixed', 100000)
       returning id`,
      [s.tenantA],
    );
    servicio = sv[0].id as string;

    const { rows: cl } = await c.query(
      `insert into public.clients (tenant_id, first_name) values ($1, 'Mov')
       returning id`,
      [s.tenantA],
    );
    cliente = cl[0].id as string;
  });
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

describe("el rastro de un turno movido", () => {
  it("nace sin marca", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      const id = await crearTurno(c, 48);
      await c.query("commit");

      const a = await leer(c, id);
      expect(a.moved_count).toBe(0);
      expect(a.moved_at).toBeNull();
      expect(a.original_starts_at).toBeNull();
    });
  });

  it("cambiar la hora lo marca y guarda de dónde salió", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      const id = await crearTurno(c, 72);
      await c.query("commit");

      const antes = await leer(c, id);

      await c.query(
        `update public.appointments
         set starts_at    = starts_at + interval '3 hours',
             ends_at      = ends_at + interval '3 hours',
             blocks_until = blocks_until + interval '3 hours'
         where id = $1`,
        [id],
      );

      const despues = await leer(c, id);
      expect(despues.moved_count).toBe(1);
      expect(despues.moved_at).not.toBeNull();
      // Guarda la hora original, no la del paso anterior.
      expect(new Date(despues.original_starts_at).getTime()).toBe(
        new Date(antes.starts_at).getTime(),
      );
    });
  });

  it("moverlo de nuevo suma, pero el origen no se pisa", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      const id = await crearTurno(c, 96);
      await c.query("commit");

      const original = (await leer(c, id)).starts_at;

      for (const horas of [2, 5]) {
        await c.query(
          `update public.appointments
           set starts_at    = starts_at + make_interval(hours => $2),
               ends_at      = ends_at + make_interval(hours => $2),
               blocks_until = blocks_until + make_interval(hours => $2)
           where id = $1`,
          [id, horas],
        );
      }

      const a = await leer(c, id);
      expect(a.moved_count).toBe(2);
      expect(new Date(a.original_starts_at).getTime()).toBe(
        new Date(original).getTime(),
      );
    });
  });

  it("cambiar el estado no lo marca como movido", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      const id = await crearTurno(c, 120);
      await c.query("commit");

      await c.query(
        `update public.appointments set status = 'attended' where id = $1`,
        [id],
      );

      const a = await leer(c, id);
      expect(a.status).toBe("attended");
      expect(a.moved_count).toBe(0);
    });
  });

  it("no gasta el cupo de cambios del cliente", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      const id = await crearTurno(c, 144);
      await c.query("commit");

      await c.query(
        `update public.appointments
         set starts_at    = starts_at + interval '1 hour',
             ends_at      = ends_at + interval '1 hour',
             blocks_until = blocks_until + interval '1 hour'
         where id = $1`,
        [id],
      );

      const { rows } = await c.query(
        `select moved_count, rescheduled_count
         from public.appointments where id = $1`,
        [id],
      );

      // Mover desde el mostrador cuenta para el control, no contra el cliente.
      expect(rows[0].moved_count).toBe(1);
      expect(rows[0].rescheduled_count).toBe(0);
    });
  });
});
