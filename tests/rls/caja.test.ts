import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;
let branchA: string;

/** Abre una caja con lo que haya en el cajón al empezar el día. */
async function abrir(c: PoolClient, inicial = 1000000): Promise<string> {
  const { rows } = await c.query(
    `select public.cash_open_session($1::bigint) as id`,
    [inicial],
  );
  return rows[0].id as string;
}

async function registrar(
  c: PoolClient,
  session: string,
  campos: {
    kind?: string;
    method?: string;
    amount: number;
    concept?: string;
  },
): Promise<string> {
  const { rows } = await c.query(
    `insert into public.cash_movements
       (tenant_id, branch_id, session_id, kind, method, amount_cents, concept)
     values ($1, $2, $3, $4::public.movement_kind, $5::public.payment_method, $6, $7)
     returning id`,
    [
      s.tenantA,
      branchA,
      session,
      campos.kind ?? "income",
      campos.method ?? "cash",
      campos.amount,
      campos.concept ?? "Cobro",
    ],
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  s = await setupScenario("caj");

  branchA = await asAdmin(async (c) => {
    const { rows } = await c.query(
      `select id from public.branches where tenant_id = $1 and is_default`,
      [s.tenantA],
    );
    return rows[0].id as string;
  });
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

/**
 * Vacía la caja entre pruebas.
 *
 * Hay que desactivar el trigger a mano: los movimientos son inmutables incluso
 * para el superusuario, que es exactamente lo que queremos en producción. Que
 * la limpieza de las pruebas tenga que pedir permiso explícito es la señal de
 * que la protección está bien puesta.
 */
async function limpiarCaja() {
  await asAdmin(async (c) => {
    await c.query(
      `alter table public.cash_movements disable trigger cash_movements_immutable`,
    );
    await c.query(`delete from public.cash_movements where tenant_id = $1`, [s.tenantA]);
    await c.query(
      `alter table public.cash_movements enable trigger cash_movements_immutable`,
    );
    await c.query(`delete from public.cash_sessions where tenant_id = $1`, [s.tenantA]);
  });
}

beforeEach(limpiarCaja);

// ---------------------------------------------------------------------------

describe("apertura y cierre", () => {
  it("el arqueo compara lo contado con lo que debería haber", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c, 1000000); // $10.000 de arranque

      await registrar(c, caja, { amount: 350000, concept: "Masaje" });
      await registrar(c, caja, { amount: 400000, concept: "Limpieza de cutis" });
      await registrar(c, caja, {
        kind: "expense",
        amount: 150000,
        concept: "Compra de algodón",
      });

      // 10.000 + 3.500 + 4.000 − 1.500 = 16.000
      const { rows: esperado } = await c.query(
        `select app.session_expected_cents($1) as e`,
        [caja],
      );
      expect(Number(esperado[0].e)).toBe(1600000);

      // Se contó $200 de menos.
      const { rows } = await c.query(
        `select public.cash_close_session($1, $2::bigint, 'Faltaron $200') as r`,
        [caja, 1580000],
      );
      expect(r(rows)).toEqual({
        expectedCents: 1600000,
        countedCents: 1580000,
        differenceCents: -20000,
      });
    });
  });

  it("el arqueo cuenta sólo el efectivo", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c, 0);

      await registrar(c, caja, { amount: 500000, method: "cash" });
      // Una transferencia es un ingreso real, pero no está en el cajón.
      await registrar(c, caja, { amount: 900000, method: "transfer" });
      await registrar(c, caja, { amount: 700000, method: "mercadopago" });

      const { rows } = await c.query(
        `select app.session_expected_cents($1) as e`,
        [caja],
      );
      expect(Number(rows[0].e)).toBe(500000);
    });
  });

  it("no se pueden tener dos cajas abiertas a la vez", async () => {
    await asUser(s.owner, async (c) => {
      await abrir(c);
      // Dos abiertas significan que nadie sabe dónde cae cada cobro.
      const code = await expectRejected(() => abrir(c));
      expect(code).toBe("23505");
    });
  });

  it("después de cerrar una se puede abrir otra", async () => {
    await asUser(s.owner, async (c) => {
      const primera = await abrir(c);
      await c.query(`select public.cash_close_session($1, 0::bigint)`, [primera]);

      const segunda = await abrir(c);
      expect(segunda).not.toBe(primera);
    });
  });

  it("una caja cerrada no se cierra dos veces", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      await c.query(`select public.cash_close_session($1, 0::bigint)`, [caja]);

      const code = await expectRejected(() =>
        c.query(`select public.cash_close_session($1, 0::bigint)`, [caja]),
      );
      expect(code).toBe("42501");
    });
  });

  it("una caja cerrada no se reabre", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      await c.query(`select public.cash_close_session($1, 0::bigint)`, [caja]);

      const code = await expectRejected(() =>
        c.query(
          `update public.cash_sessions set closed_at = null, counted_cents = null
           where id = $1`,
          [caja],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("no se puede seguir cobrando en una caja cerrada", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      await c.query(`select public.cash_close_session($1, 0::bigint)`, [caja]);

      const code = await expectRejected(() =>
        registrar(c, caja, { amount: 100000 }),
      );
      // El cierre quedaría mintiendo.
      expect(code).toBe("42501");
    });
  });
});

describe("los movimientos son inmutables", () => {
  it("no se pueden editar", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      const mov = await registrar(c, caja, { amount: 350000 });

      const code = await expectRejected(() =>
        c.query(`update public.cash_movements set amount_cents = 1 where id = $1`, [
          mov,
        ]),
      );
      expect(code).toBe("42501");
    });
  });

  it("no se pueden borrar", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      const mov = await registrar(c, caja, { amount: 350000 });

      const code = await expectRejected(() =>
        c.query(`delete from public.cash_movements where id = $1`, [mov]),
      );
      expect(code).toBe("42501");
    });
  });

  it("un error se corrige anulando, y el total vuelve a cero", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c, 0);
      const mov = await registrar(c, caja, {
        amount: 350000,
        concept: "Masaje",
      });

      await c.query(`select public.cash_reverse_movement($1, 'Cobré de más')`, [mov]);

      const { rows } = await c.query(
        `select app.session_expected_cents($1) as e`,
        [caja],
      );
      expect(Number(rows[0].e)).toBe(0);

      // Quedan los dos: se ve que hubo una corrección, no que algo desapareció.
      const { rows: movs } = await c.query(
        `select kind, concept from public.cash_movements
         where session_id = $1 order by created_at`,
        [caja],
      );
      expect(movs).toHaveLength(2);
      expect(movs[1].kind).toBe("expense");
      expect(movs[1].concept).toContain("Anulación");
      expect(movs[1].concept).toContain("Cobré de más");
    });
  });

  it("un movimiento se anula una sola vez", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      const mov = await registrar(c, caja, { amount: 350000 });

      await c.query(`select public.cash_reverse_movement($1)`, [mov]);

      const code = await expectRejected(() =>
        c.query(`select public.cash_reverse_movement($1)`, [mov]),
      );
      expect(code).toBe("23505");
    });
  });

  it("una anulación no se puede anular", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      const mov = await registrar(c, caja, { amount: 350000 });
      const { rows } = await c.query(
        `select public.cash_reverse_movement($1) as id`,
        [mov],
      );

      const code = await expectRejected(() =>
        c.query(`select public.cash_reverse_movement($1)`, [rows[0].id]),
      );
      expect(code).toBe("23514");
    });
  });

  it("los importes son siempre positivos", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c);
      // El signo lo da el tipo de movimiento: guardar negativos invita a
      // sumarlos mal en cualquier consulta futura.
      const code = await expectRejected(() =>
        registrar(c, caja, { amount: -100000 }),
      );
      expect(code).toBe("23514");
    });
  });
});

describe("cuánto se cobró de un turno", () => {
  it("suma los cobros y descuenta los anulados", async () => {
    const turno = await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      const { rows: sv } = await c.query(
        `insert into public.services
           (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
         values ($1, 'Masaje caja', 60, 5, 'fixed', 350000) returning id`,
        [s.tenantA],
      );
      const { rows: cl } = await c.query(
        `insert into public.clients (tenant_id, first_name) values ($1, 'Paga') returning id`,
        [s.tenantA],
      );
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], now() + interval '1 day') as id`,
        [cl[0].id, [sv[0].id]],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
      return rows[0].id as string;
    });

    await asUser(s.owner, async (c) => {
      const caja = await abrir(c, 0);

      // Una seña y después el saldo.
      await c.query(
        `insert into public.cash_movements
           (tenant_id, branch_id, session_id, kind, method, amount_cents, concept, appointment_id)
         values ($1, $2, $3, 'income', 'cash', 150000, 'Seña', $4)`,
        [s.tenantA, branchA, caja, turno],
      );
      const { rows: saldo } = await c.query(
        `insert into public.cash_movements
           (tenant_id, branch_id, session_id, kind, method, amount_cents, concept, appointment_id)
         values ($1, $2, $3, 'income', 'cash', 200000, 'Saldo', $4) returning id`,
        [s.tenantA, branchA, caja, turno],
      );

      let { rows } = await c.query(
        `select public.appointment_paid_cents($1) as p`,
        [turno],
      );
      expect(Number(rows[0].p)).toBe(350000);

      await c.query(`select public.cash_reverse_movement($1)`, [saldo[0].id]);

      ({ rows } = await c.query(
        `select public.appointment_paid_cents($1) as p`,
        [turno],
      ));
      expect(Number(rows[0].p)).toBe(150000);
    });

    await limpiarCaja();
    await asAdmin(async (c) => {
      await c.query(`delete from public.appointments where id = $1`, [turno]);
    });
  });
});

describe("quién puede tocar la caja", () => {
  it("recepción abre y cobra", async () => {
    await asUser(s.reception, async (c) => {
      const caja = await abrir(c);
      const mov = await registrar(c, caja, { amount: 350000 });
      expect(mov).toBeTruthy();
    });
  });

  it("un profesional no ve la plata del negocio", async () => {
    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `insert into public.cash_sessions (tenant_id, branch_id, opening_cents)
         values ($1, $2, 500000) returning id`,
        [s.tenantA, branchA],
      );
      await c.query(
        `insert into public.cash_movements
           (tenant_id, branch_id, session_id, kind, method, amount_cents, concept)
         values ($1, $2, $3, 'income', 'cash', 350000, 'Masaje')`,
        [s.tenantA, branchA, rows[0].id],
      );
    });

    await asUser(s.staff, async (c) => {
      const { rows: cajas } = await c.query(`select id from public.cash_sessions`);
      expect(cajas).toHaveLength(0);

      const { rows: movs } = await c.query(`select id from public.cash_movements`);
      expect(movs).toHaveLength(0);
    });
  });

  it("el negocio vecino no ve nada", async () => {
    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `insert into public.cash_sessions (tenant_id, branch_id, opening_cents)
         values ($1, $2, 500000) returning id`,
        [s.tenantA, branchA],
      );
      await c.query(
        `insert into public.cash_movements
           (tenant_id, branch_id, session_id, kind, method, amount_cents, concept)
         values ($1, $2, $3, 'income', 'cash', 350000, 'Masaje')`,
        [s.tenantA, branchA, rows[0].id],
      );
    });

    await asUser(s.intruder, async (c) => {
      const { rows: cajas } = await c.query(`select id from public.cash_sessions`);
      expect(cajas).toHaveLength(0);

      const code = await expectRejected(() =>
        c.query(
          `insert into public.cash_movements
             (tenant_id, branch_id, kind, method, amount_cents, concept)
           values ($1, $2, 'income', 'cash', 100, 'Colado')`,
          [s.tenantA, branchA],
        ),
      );
      expect(code).toBe("42501");
    });
  });
});

/** Desarma el jsonb que devuelve el cierre. */
function r(rows: Array<{ r: Record<string, number> }>) {
  const { expectedCents, countedCents, differenceCents } = rows[0].r;
  return {
    expectedCents: Number(expectedCents),
    countedCents: Number(countedCents),
    differenceCents: Number(differenceCents),
  };
}

describe("el arqueo queda guardado", () => {
  it("una caja cerrada conserva lo esperado y la diferencia", async () => {
    await asUser(s.owner, async (c) => {
      const caja = await abrir(c, 1000000);
      await registrar(c, caja, { amount: 500000 });

      await c.query(`select public.cash_close_session($1, $2::bigint)`, [
        caja,
        1480000,
      ]);

      const { rows } = await c.query(
        `select opening_cents, expected_cents, counted_cents, difference_cents
         from public.cash_sessions where id = $1`,
        [caja],
      );

      // Sin guardarlo, mirar el mes hacia atrás para ver si la caja cuadra
      // siempre sería imposible: el número se calculaba al vuelo y se perdía.
      expect(Number(rows[0].expected_cents)).toBe(1500000);
      expect(Number(rows[0].counted_cents)).toBe(1480000);
      expect(Number(rows[0].difference_cents)).toBe(-20000);
    });
  });
});

describe("el efectivo vive dentro de una caja", () => {
  it("no se puede registrar efectivo sin una caja abierta", async () => {
    await asUser(s.owner, async (c) => {
      // Sin sesión no hay cajón donde contarlo al cerrar el día: sería plata
      // guardada y perdida a la vez.
      const code = await expectRejected(() =>
        c.query(
          `insert into public.cash_movements
             (tenant_id, branch_id, kind, method, amount_cents, concept)
           values ($1, $2, 'income', 'cash', 350000, 'Masaje')`,
          [s.tenantA, branchA],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it("una transferencia sí se registra con la caja cerrada", async () => {
    await asUser(s.owner, async (c) => {
      // No pasa por el cajón, así que no necesita caja. La pantalla la muestra
      // aparte para que no quede invisible.
      const { rows } = await c.query(
        `insert into public.cash_movements
           (tenant_id, branch_id, kind, method, amount_cents, concept)
         values ($1, $2, 'income', 'transfer', 350000, 'Masaje')
         returning id, session_id`,
        [s.tenantA, branchA],
      );
      expect(rows[0].session_id).toBeNull();
    });
  });
});
