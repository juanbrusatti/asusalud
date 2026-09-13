import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asAdmin,
  asUser,
  createAuthUser,
  expectRejected,
  pool,
} from "./helpers";

/**
 * Suite de aislamiento entre estéticas.
 *
 * Ninguna funcionalidad que toque datos se considera terminada sin su prueba
 * acá. El escenario es siempre el mismo: dos estéticas que no se conocen y un
 * intento explícito de que una lea o escriba sobre la otra.
 */

let alicia: string; // dueña de Estética Aurora
let bruno: string; // dueño de Estética Boreal, sin relación con Aurora
let carla: string; // recepción en Aurora
let diego: string; // admin en Aurora

let aurora: string;
let boreal: string;

const EMAILS = [
  "alicia@aurora.test",
  "bruno@boreal.test",
  "carla@aurora.test",
  "diego@aurora.test",
];

async function cleanup() {
  await asAdmin(async (c) => {
    await c.query(
      `delete from public.tenants where slug in ('aurora-test','boreal-test')`,
    );
    await c.query(`delete from auth.users where email = any($1)`, [EMAILS]);
  });
}

beforeAll(async () => {
  await cleanup();

  alicia = await createAuthUser("alicia@aurora.test", "Alicia Funes");
  bruno = await createAuthUser("bruno@boreal.test", "Bruno Paz");
  carla = await createAuthUser("carla@aurora.test", "Carla Ortiz");
  diego = await createAuthUser("diego@aurora.test", "Diego Salas");

  // Cada dueña crea su estética por el único camino permitido.
  aurora = await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: alicia, role: "authenticated" }),
    ]);
    const { rows } = await c.query(
      `select (public.create_tenant('Estética Aurora', 'aurora-test')).id as id`,
    );
    return rows[0].id as string;
  });

  boreal = await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: bruno, role: "authenticated" }),
    ]);
    const { rows } = await c.query(
      `select (public.create_tenant('Estética Boreal', 'boreal-test')).id as id`,
    );
    return rows[0].id as string;
  });

  // Carla entra como recepción y Diego como admin, ambos en Aurora.
  await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: alicia, role: "authenticated" }),
    ]);
    await c.query(
      `insert into public.memberships (tenant_id, user_id, role)
       values ($1, $2, 'reception'), ($1, $3, 'admin')`,
      [aurora, carla, diego],
    );
    await c.query(`select set_config('request.jwt.claims', '', false)`);
  });
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

// ---------------------------------------------------------------------------

describe("alta de una estética", () => {
  it("deja a quien la crea como dueña y con una sucursal principal", async () => {
    await asUser(alicia, async (c) => {
      const { rows: members } = await c.query(
        `select role, status from public.memberships
         where tenant_id = $1 and user_id = $2`,
        [aurora, alicia],
      );
      expect(members).toEqual([{ role: "owner", status: "active" }]);

      const { rows: branches } = await c.query(
        `select name, is_default from public.branches where tenant_id = $1`,
        [aurora],
      );
      expect(branches).toEqual([{ name: "Principal", is_default: true }]);
    });
  });

  it("no permite insertar en tenants por fuera de create_tenant", async () => {
    await asUser(alicia, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.tenants (name, slug) values ('Colada', 'colada-test')`,
        ),
      );
      // 42501 = permiso denegado. No hay GRANT de INSERT ni política.
      expect(code).toBe("42501");
    });
  });
});

describe("aislamiento entre estéticas", () => {
  it("cada dueña ve únicamente la suya", async () => {
    await asUser(alicia, async (c) => {
      const { rows } = await c.query(`select id from public.tenants`);
      expect(rows.map((r) => r.id)).toEqual([aurora]);
    });

    await asUser(bruno, async (c) => {
      const { rows } = await c.query(`select id from public.tenants`);
      expect(rows.map((r) => r.id)).toEqual([boreal]);
    });
  });

  it("pedir la estética ajena por id devuelve vacío, no un error", async () => {
    await asUser(alicia, async (c) => {
      const { rows } = await c.query(
        `select id from public.tenants where id = $1`,
        [boreal],
      );
      expect(rows).toHaveLength(0);
    });
  });

  it("no se puede editar la estética ajena", async () => {
    await asUser(alicia, async (c) => {
      const { rowCount } = await c.query(
        `update public.tenants set name = 'Secuestrada' where id = $1`,
        [boreal],
      );
      expect(rowCount).toBe(0);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select name from public.tenants where id = $1`,
        [boreal],
      );
      expect(rows[0].name).toBe("Estética Boreal");
    });
  });

  it("no se pueden ver las sucursales ajenas", async () => {
    await asUser(alicia, async (c) => {
      const { rows } = await c.query(
        `select id from public.branches where tenant_id = $1`,
        [boreal],
      );
      expect(rows).toHaveLength(0);
    });
  });

  it("no se puede crear una sucursal en la estética ajena", async () => {
    await asUser(alicia, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.branches (tenant_id, name) values ($1, 'Infiltrada')`,
          [boreal],
        ),
      );
      // 42501 = la cláusula WITH CHECK de la política rechazó la fila.
      expect(code).toBe("42501");
    });
  });

  it("no se pueden ver las membresías ajenas", async () => {
    await asUser(alicia, async (c) => {
      const { rows } = await c.query(
        `select id from public.memberships where tenant_id = $1`,
        [boreal],
      );
      expect(rows).toHaveLength(0);
    });
  });

  it("no se puede autoinvitar a la estética ajena", async () => {
    await asUser(alicia, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.memberships (tenant_id, user_id, role)
           values ($1, $2, 'admin')`,
          [boreal, alicia],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("no se ve el perfil de alguien de otra estética", async () => {
    await asUser(alicia, async (c) => {
      const { rows } = await c.query(
        `select id from public.profiles where id = $1`,
        [bruno],
      );
      expect(rows).toHaveLength(0);
    });
  });

  it("sí se ve el perfil de un compañero de equipo", async () => {
    await asUser(alicia, async (c) => {
      const { rows } = await c.query(
        `select full_name from public.profiles where id = $1`,
        [carla],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].full_name).toBe("Carla Ortiz");
    });
  });
});

describe("visitante sin sesión", () => {
  it("no ve absolutamente nada", async () => {
    await asUser(null, async (c) => {
      for (const table of [
        "tenants",
        "branches",
        "profiles",
        "memberships",
        "audit_log",
      ]) {
        // Cada intento en su propio savepoint: el primer rechazo aborta la
        // transacción y sin esto los siguientes fallarían por arrastre.
        await c.query("savepoint probe");
        const code = await expectRejected(() =>
          c.query(`select * from public.${table}`),
        );
        await c.query("rollback to savepoint probe");
        expect(code, `anon pudo leer ${table}`).toBe("42501");
      }
    });
  });
});

describe("roles dentro de una misma estética", () => {
  it("recepción ve la estética pero no la puede editar", async () => {
    await asUser(carla, async (c) => {
      const { rows } = await c.query(`select id from public.tenants`);
      expect(rows.map((r) => r.id)).toEqual([aurora]);

      const { rowCount } = await c.query(
        `update public.tenants set name = 'Renombrada' where id = $1`,
        [aurora],
      );
      expect(rowCount).toBe(0);
    });
  });

  it("recepción no puede invitar gente", async () => {
    await asUser(carla, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.memberships (tenant_id, user_id, role)
           values ($1, $2, 'staff')`,
          [aurora, bruno],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("un admin puede invitar, pero no fabricar dueños", async () => {
    await asUser(diego, async (c) => {
      await c.query(
        `insert into public.memberships (tenant_id, user_id, role)
         values ($1, $2, 'staff')`,
        [aurora, bruno],
      );

      const code = await expectRejected(() =>
        c.query(
          `update public.memberships set role = 'owner'
           where tenant_id = $1 and user_id = $2`,
          [aurora, diego],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("recepción no lee la bitácora y el dueño sí", async () => {
    await asUser(carla, async (c) => {
      const { rows } = await c.query(`select id from public.audit_log`);
      expect(rows).toHaveLength(0);
    });

    await asUser(alicia, async (c) => {
      const { rows } = await c.query(
        `select entity from public.audit_log where tenant_id = $1`,
        [aurora],
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  });
});

describe("salvaguardas", () => {
  it("la estética no se puede quedar sin dueño activo", async () => {
    await asUser(alicia, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `delete from public.memberships where tenant_id = $1 and user_id = $2`,
          [aurora, alicia],
        ),
      );
      // 23514 = lo frenó el trigger guard_last_owner.
      expect(code).toBe("23514");
    });
  });

  it("una membresía suspendida deja de ver la estética", async () => {
    await asAdmin(async (c) => {
      await c.query("begin");
      await c.query(
        `update public.memberships set status = 'suspended'
         where tenant_id = $1 and user_id = $2`,
        [aurora, carla],
      );
      await c.query(`set local role authenticated`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: carla, role: "authenticated" }),
      ]);

      const { rows } = await c.query(`select id from public.tenants`);
      expect(rows).toHaveLength(0);

      await c.query("rollback");
    });
  });

  it("la bitácora registra los cambios con su autor", async () => {
    await asUser(alicia, async (c) => {
      const { rows } = await c.query(
        `select action, entity, actor_id from public.audit_log
         where tenant_id = $1 and entity = 'tenants' and action = 'insert'`,
        [aurora],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(alicia);
    });
  });
});

/**
 * La superficie que queda expuesta a quien no tiene sesión.
 *
 * Supabase concede EXECUTE a `anon` sobre **cada función nueva** del esquema
 * `public` por privilegios por defecto. Un `revoke ... from public` no lo
 * quita, porque `public` es el pseudo-rol y el de `anon` es un permiso
 * explícito aparte. Así quedó abierta `register_push_subscription`, que acepta
 * el id de clienta que se le pase: un visitante podía suscribir su navegador a
 * los recordatorios de otra persona.
 *
 * Esta prueba es el guardia: si alguien agrega una función y se olvida de
 * cerrarla, acá se ve.
 */
describe("qué puede ejecutar un visitante sin sesión", () => {
  const PERMITIDAS = [
    "booking_cancel",
    "booking_confirm",
    "booking_create",
    "booking_manage",
    "booking_manage_slots",
    "booking_page",
    "booking_reschedule",
    "booking_slots",
    "booking_subscribe_push",
  ];

  it("sólo las nueve funciones de la reserva pública", async () => {
    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and has_function_privilege('anon', p.oid, 'execute')
         group by p.proname
         order by p.proname`,
      );
      expect(rows.map((r) => r.proname)).toEqual(PERMITIDAS);
    });
  });
});
