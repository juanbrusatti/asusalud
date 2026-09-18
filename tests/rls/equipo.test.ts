import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, createAuthUser, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * Sumar gente al equipo.
 *
 * Los cuatro roles existían desde el principio y la RLS los respeta en todas
 * las tablas, pero no había forma de dar de alta a una segunda persona. Lo que
 * se prueba acá es que la puerta nueva no sea más ancha que la que ya había:
 * que no se pueda invitar a un titular, que quien atiende no pueda repartir
 * accesos, y que un enlace sirva una sola vez.
 */

let s: Scenario;
let recluta: string;
const correoRecluta = "recluta-eq@a.test";

/** Corre como un usuario y COMMITEA, para poder leer el efecto después. */
async function como<T>(
  userId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  return asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    try {
      return await fn(c);
    } finally {
      await c.query("select set_config('request.jwt.claims', '', false)");
    }
  });
}

async function invitar(
  quien: string,
  rol = "staff",
): Promise<{ ok: boolean; token?: string; error?: string }> {
  return como(quien, async (c) => {
    const { rows } = await c.query(
      `select public.team_invite($1::public.app_role, 'Ana') as r`,
      [rol],
    );
    return rows[0].r;
  });
}

async function aceptar(quien: string, token: string) {
  return como(quien, async (c) => {
    const { rows } = await c.query(`select public.team_join($1) as r`, [token]);
    return rows[0].r as { ok: boolean; error?: string; ya_estaba?: boolean };
  });
}

beforeAll(async () => {
  s = await setupScenario("eq");
  recluta = await createAuthUser(correoRecluta, "Ana Recluta");
});

afterEach(async () => {
  await asAdmin(async (c) => {
    await c.query(`delete from public.invitations where tenant_id = $1`, [
      s.tenantA,
    ]);
    await c.query(
      `delete from public.memberships where tenant_id = $1 and user_id = $2`,
      [s.tenantA, recluta],
    );
  });
});

afterAll(async () => {
  await asAdmin((c) =>
    c.query(`delete from auth.users where email = $1`, [correoRecluta]),
  );
  await teardownScenario(s);
  await pool.end();
});

describe("invitar", () => {
  it("la titular reparte un enlace y alguien entra con el rol dado", async () => {
    const inv = await invitar(s.owner, "reception");
    expect(inv.ok).toBe(true);
    expect(inv.token).toMatch(/^[0-9a-f]{48}$/);

    const r = await aceptar(recluta, inv.token!);
    expect(r.ok).toBe(true);

    const rol = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select role from public.memberships
         where tenant_id = $1 and user_id = $2`,
        [s.tenantA, recluta],
      );
      return rows[0]?.role;
    });
    expect(rol).toBe("reception");
  });

  it("administración también puede invitar", async () => {
    const inv = await invitar(s.admin);
    expect(inv.ok).toBe(true);
  });

  it("quien atiende no puede repartir accesos", async () => {
    const inv = await invitar(s.staff);
    expect(inv.ok).toBe(false);
    expect(inv.error).toMatch(/no encontramos tu negocio/i);
  });

  it("no se puede invitar a alguien como titular", async () => {
    // Lo corta la función con un mensaje, antes de llegar al check de la
    // tabla: quien invita merece saber por qué no se pudo.
    const inv = await invitar(s.owner, "owner");
    expect(inv.ok).toBe(false);
    expect(inv.error).toMatch(/no se puede invitar/i);
  });
});

describe("el enlace", () => {
  it("sirve una sola vez", async () => {
    const inv = await invitar(s.owner);
    expect((await aceptar(recluta, inv.token!)).ok).toBe(true);

    const otro = await createAuthUser("otro-eq@a.test", "Otro");
    const segunda = await aceptar(otro, inv.token!);
    expect(segunda.ok).toBe(false);
    expect(segunda.error).toMatch(/ya se usó/i);

    await asAdmin((c) =>
      c.query(`delete from auth.users where email = 'otro-eq@a.test'`),
    );
  });

  it("vencido no entra", async () => {
    const inv = await invitar(s.owner);
    await asAdmin((c) =>
      c.query(
        `update public.invitations set expires_at = now() - interval '1 day'
         where token = $1`,
        [inv.token],
      ),
    );

    const r = await aceptar(recluta, inv.token!);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/venció/i);
  });

  it("inventado no entra", async () => {
    const r = await aceptar(recluta, "0".repeat(48));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no sirve/i);
  });

  it("si ya estaba en el equipo no se quema el enlace", async () => {
    const inv = await invitar(s.owner);

    // La usa alguien que ya pertenece: el enlace no era para ella.
    const r = await aceptar(s.reception, inv.token!);
    expect(r.ok).toBe(true);
    expect(r.ya_estaba).toBe(true);

    // Y sigue sirviendo para quien sí venía.
    expect((await aceptar(recluta, inv.token!)).ok).toBe(true);
  });

  it("el otro negocio no ve las invitaciones de este", async () => {
    await invitar(s.owner);

    const cuantas = await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int n from public.invitations`,
      );
      return rows[0].n as number;
    });
    expect(cuantas).toBe(0);
  });
});

describe("el equipo", () => {
  it("se lista con su rol", async () => {
    const equipo = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select public.team_members() as r`);
      return rows[0].r as Array<{ rol: string; soy_yo: boolean }>;
    });

    // Titular, administración, recepción y quien atiende.
    expect(equipo).toHaveLength(4);
    expect(equipo[0].rol).toBe("owner");
    expect(equipo[0].soy_yo).toBe(true);
  });

  it("quien atiende no ve la lista", async () => {
    const equipo = await asUser(s.staff, async (c) => {
      const { rows } = await c.query(`select public.team_members() as r`);
      return rows[0].r as unknown[];
    });
    expect(equipo).toHaveLength(0);
  });

  it("no te podés sacar a vos misma ni sacar al titular", async () => {
    const propia = await como(s.owner, async (c) => {
      const { rows } = await c.query(`select public.team_remove($1) as r`, [
        s.owner,
      ]);
      return rows[0].r as { ok: boolean; error?: string };
    });
    expect(propia.ok).toBe(false);
    expect(propia.error).toMatch(/vos misma/i);

    const titular = await como(s.admin, async (c) => {
      const { rows } = await c.query(`select public.team_remove($1) as r`, [
        s.owner,
      ]);
      return rows[0].r as { ok: boolean; error?: string };
    });
    expect(titular.ok).toBe(false);
    expect(titular.error).toMatch(/titular/i);
  });

  it("sacar a alguien le corta el acceso de verdad", async () => {
    const inv = await invitar(s.owner);
    await aceptar(recluta, inv.token!);

    const antes = await asUser(recluta, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int n from public.clients`,
      );
      return rows[0].n as number;
    });
    expect(antes).toBeGreaterThanOrEqual(0);

    await como(s.owner, (c) =>
      c.query(`select public.team_remove($1)`, [recluta]),
    );

    // Sin membresía, la RLS deja de devolverle el negocio.
    const despues = await asUser(recluta, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int n from public.tenants`,
      );
      return rows[0].n as number;
    });
    expect(despues).toBe(0);
  });
});
