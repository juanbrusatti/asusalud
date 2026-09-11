import { Pool, type PoolClient } from "pg";

/**
 * Las pruebas hablan directo con Postgres, no con PostgREST. Así se verifica
 * la RLS en sí misma y no la capa HTTP que la envuelve: si una política está
 * mal escrita, acá se ve, aunque la API la tape por otro motivo.
 */
export const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new Pool({ connectionString: DB_URL, max: 8 });

/** Corre como superusuario, sin RLS. Sólo para preparar y limpiar datos. */
export async function asAdmin<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

/**
 * Corre como un usuario autenticado concreto, replicando lo que hace Supabase:
 * rol `authenticated` y el claim `sub` con su id. Todo ocurre dentro de una
 * transacción que siempre se revierte, así ninguna prueba ensucia a la
 * siguiente.
 *
 * Con `userId` en null corre como `anon`, que es el visitante sin sesión.
 */
export async function asUser<T>(
  userId: string | null,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
    if (userId) {
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    }
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

/** Crea un usuario en auth.users. El trigger se encarga del perfil. */
export async function createAuthUser(email: string, fullName: string) {
  return asAdmin(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at,
         raw_app_meta_data, raw_user_meta_data
       )
       values (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated', $1, crypt('test-password', gen_salt('bf')),
         now(), now(), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', $2::text)
       )
       returning id`,
      [email, fullName],
    );
    return rows[0].id;
  });
}

/** Espera que una consulta sea rechazada por la base. Devuelve el SQLSTATE. */
export async function expectRejected(
  fn: () => Promise<unknown>,
): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return (err as { code?: string }).code ?? "unknown";
  }
  throw new Error(
    "La consulta debería haber sido rechazada por la base y no lo fue.",
  );
}
