import { asAdmin, createAuthUser } from "./helpers";

export type Scenario = {
  /** Titular del negocio A. */
  owner: string;
  /** Titular del negocio B, sin ninguna relación con A. */
  intruder: string;
  /** Recepción en A. */
  reception: string;
  /** Administración en A. */
  admin: string;
  /** Profesional en A. */
  staff: string;
  tenantA: string;
  tenantB: string;
  emails: string[];
  slugs: string[];
};

/** Crea un negocio actuando como el usuario indicado. */
async function createTenantAs(userId: string, name: string, slug: string) {
  return asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const { rows } = await c.query(
      `select (public.create_tenant($1, $2)).id as id`,
      [name, slug],
    );
    await c.query("select set_config('request.jwt.claims', '', false)");
    return rows[0].id as string;
  });
}

/**
 * Dos negocios que no se conocen, con los cuatro roles poblados en la
 * primera. Es el escenario base de todas las pruebas de aislamiento.
 *
 * El `prefix` hace que cada archivo de pruebas use sus propios correos y
 * slugs, así no se pisan entre sí.
 */
export async function setupScenario(prefix: string): Promise<Scenario> {
  const emails = [
    `owner-${prefix}@a.test`,
    `intruder-${prefix}@b.test`,
    `reception-${prefix}@a.test`,
    `admin-${prefix}@a.test`,
    `staff-${prefix}@a.test`,
  ];
  const slugs = [`${prefix}-a`, `${prefix}-b`];

  await teardownScenario({ emails, slugs } as Scenario);

  const [owner, intruder, reception, admin, staff] = await Promise.all(
    emails.map((e, i) =>
      createAuthUser(
        e,
        ["Ana Ruiz", "Beto Paz", "Cora Diaz", "Dario Luna", "Eva Sosa"][i],
      ),
    ),
  );

  const tenantA = await createTenantAs(owner, `Negocio ${prefix} A`, slugs[0]);
  const tenantB = await createTenantAs(
    intruder,
    `Negocio ${prefix} B`,
    slugs[1],
  );

  await asAdmin(async (c) => {
    await c.query(
      `insert into public.memberships (tenant_id, user_id, role)
       values ($1, $2, 'reception'), ($1, $3, 'admin'), ($1, $4, 'staff')`,
      [tenantA, reception, admin, staff],
    );
  });

  return {
    owner,
    intruder,
    reception,
    admin,
    staff,
    tenantA,
    tenantB,
    emails,
    slugs,
  };
}

export async function teardownScenario(s: Pick<Scenario, "emails" | "slugs">) {
  await asAdmin(async (c) => {
    await c.query(`delete from public.tenants where slug = any($1)`, [s.slugs]);
    await c.query(`delete from auth.users where email = any($1)`, [s.emails]);
  });
}
