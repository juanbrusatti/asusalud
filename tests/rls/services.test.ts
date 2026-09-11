import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;
let servicioA: string;

beforeAll(async () => {
  s = await setupScenario("srv");

  // Un servicio real de Asusalud: depilación con aparato, dos cabinas.
  // Se inserta fuera de una transacción reversible porque el resto de las
  // pruebas lo necesita confirmado. El claim se setea igual para que el
  // trigger de historial registre a la dueña como autora del precio.
  servicioA = await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: s.owner, role: "authenticated" }),
    ]);
    const { rows } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Depilación Definitiva', 40, 2, 'fixed', 1000000)
       returning id`,
      [s.tenantA],
    );
    await c.query("select set_config('request.jwt.claims', '', false)");
    return rows[0].id as string;
  });
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

describe("aislamiento del catálogo", () => {
  it("la estética vecina no ve los servicios", async () => {
    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select id from public.services`);
      expect(rows).toHaveLength(0);
    });
  });

  it("no se puede crear un servicio en la estética ajena", async () => {
    await asUser(s.intruder, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.services (tenant_id, name, price_mode, price_cents)
           values ($1, 'Infiltrado', 'fixed', 100)`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("no se puede cambiarle el precio a la estética ajena", async () => {
    await asUser(s.intruder, async (c) => {
      const { rowCount } = await c.query(
        `update public.services set price_cents = 1 where id = $1`,
        [servicioA],
      );
      expect(rowCount).toBe(0);
    });
  });

  it("no se puede mudar un servicio propio a la estética ajena", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(`update public.services set tenant_id = $1 where id = $2`, [
          s.tenantB,
          servicioA,
        ]),
      );
      // La cláusula WITH CHECK evalúa la fila NUEVA: el destino es ajeno.
      expect(code).toBe("42501");
    });
  });

  it("dos estéticas pueden tener un servicio con el mismo nombre", async () => {
    await asUser(s.intruder, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.services
           (tenant_id, name, price_mode, price_cents)
         values ($1, 'Depilación Definitiva', 'fixed', 500000)`,
        [s.tenantB],
      );
      expect(rowCount).toBe(1);
    });
  });
});

describe("quién puede tocar el catálogo", () => {
  it("recepción lo ve pero no lo edita", async () => {
    await asUser(s.reception, async (c) => {
      const { rows } = await c.query(
        `select name from public.services where tenant_id = $1`,
        [s.tenantA],
      );
      expect(rows).toHaveLength(1);

      const { rowCount } = await c.query(
        `update public.services set price_cents = 1 where id = $1`,
        [servicioA],
      );
      expect(rowCount).toBe(0);
    });
  });

  it("recepción no puede crear servicios", async () => {
    await asUser(s.reception, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.services (tenant_id, name, price_mode, price_cents)
           values ($1, 'Improvisado', 'fixed', 100)`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("administración sí puede", async () => {
    await asUser(s.admin, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.services (tenant_id, name, price_mode, price_cents)
         values ($1, 'Masaje descontracturante', 'fixed', 350000)`,
        [s.tenantA],
      );
      expect(rowCount).toBe(1);
    });
  });
});

describe("reglas del catálogo", () => {
  it("un precio fijo no puede quedar vacío", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.services (tenant_id, name, price_mode, price_cents)
           values ($1, 'Sin precio', 'fixed', null)`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it('"a convenir" no admite un precio cargado', async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.services (tenant_id, name, price_mode, price_cents)
           values ($1, 'Contradictorio', 'on_request', 5000)`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it('"a convenir" sin precio es válido', async () => {
    await asUser(s.owner, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.services (tenant_id, name, price_mode)
         values ($1, 'Exosomas', 'on_request')`,
        [s.tenantA],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("la capacidad no puede ser cero", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.services
             (tenant_id, name, capacity, price_mode, price_cents)
           values ($1, 'Fantasma', 0, 'fixed', 100)`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it("no se puede repetir el nombre dentro de la misma estética", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.services (tenant_id, name, price_mode, price_cents)
           values ($1, '  depilación definitiva  ', 'fixed', 900000)`,
          [s.tenantA],
        ),
      );
      // 23505: el índice único ignora mayúsculas y espacios sobrantes.
      expect(code).toBe("23505");
    });
  });

  it("borrar una categoría no borra sus servicios", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `insert into public.service_categories (tenant_id, name)
         values ($1, 'Corporales') returning id`,
        [s.tenantA],
      );
      const categoria = rows[0].id;

      await c.query(`update public.services set category_id = $1 where id = $2`, [
        categoria,
        servicioA,
      ]);
      await c.query(`delete from public.service_categories where id = $1`, [
        categoria,
      ]);

      const { rows: after } = await c.query(
        `select category_id from public.services where id = $1`,
        [servicioA],
      );
      expect(after).toHaveLength(1);
      expect(after[0].category_id).toBeNull();
    });
  });
});

describe("historial de precios", () => {
  it("queda registrado al crear el servicio", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select price_cents, changed_by from public.service_price_history
         where service_id = $1 order by valid_from`,
        [servicioA],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].price_cents)).toBe(1000000);
      expect(rows[0].changed_by).toBe(s.owner);
    });
  });

  it("suma una fila cuando cambia el precio", async () => {
    await asUser(s.owner, async (c) => {
      await c.query(`update public.services set price_cents = $1 where id = $2`, [
        1500000,
        servicioA,
      ]);

      const { rows } = await c.query(
        `select price_cents from public.service_price_history
         where service_id = $1 order by valid_from`,
        [servicioA],
      );
      expect(rows.map((r) => Number(r.price_cents))).toEqual([1000000, 1500000]);
    });
  });

  it("no suma nada si lo que cambia es otra cosa", async () => {
    await asUser(s.owner, async (c) => {
      await c.query(
        `update public.services set description = 'Con aparatología' where id = $1`,
        [servicioA],
      );

      const { rows } = await c.query(
        `select count(*)::int as n from public.service_price_history
         where service_id = $1`,
        [servicioA],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it("recepción no ve el historial de precios", async () => {
    await asUser(s.reception, async (c) => {
      const { rows } = await c.query(
        `select id from public.service_price_history`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  it("el historial ajeno no se ve", async () => {
    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(
        `select id from public.service_price_history where service_id = $1`,
        [servicioA],
      );
      expect(rows).toHaveLength(0);
    });
  });
});
