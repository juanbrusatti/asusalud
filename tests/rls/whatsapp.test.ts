import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * Conectar WhatsApp desde el panel.
 *
 * Lo que se prueba es que el token entre y no salga: la tabla no tiene ningún
 * permiso para quien navega, y la única forma de escribir es una función que
 * comprueba el rol por su cuenta, porque ninguna política la protege.
 */

let s: Scenario;

type R = { ok: boolean; error?: string };

/**
 * Corre como un usuario concreto y **sin revertir al final**.
 *
 * `asUser` envuelve todo en una transacción que siempre vuelve atrás, que es
 * lo que hace falta para probar permisos. Pero acá lo que se mira es el
 * efecto —que el token haya quedado guardado— y eso se lee desde otra
 * conexión, después de confirmar.
 */
async function comoUsuario<T>(
  userId: string,
  fn: (c: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  return asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await c.query("set role authenticated");
    try {
      return await fn(c);
    } finally {
      // Sin esto la conexión vuelve al pool disfrazada y rompe la prueba
      // siguiente por un motivo que no tiene nada que ver.
      await c.query("reset role").catch(() => {});
      await c
        .query("select set_config('request.jwt.claims', '', false)")
        .catch(() => {});
    }
  });
}

async function conectar(
  usuario: string,
  numero = "123456789012345",
  token = "EAA-un-token-larguisimo-de-verdad",
): Promise<R> {
  return comoUsuario(usuario, async (c) => {
    const { rows } = await c.query(
      `select public.whatsapp_connect($1, $2, 'WABA-1', '+5493584123456') as r`,
      [numero, token],
    );
    return rows[0].r as R;
  });
}

beforeAll(async () => {
  s = await setupScenario("wap");
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

beforeEach(async () => {
  await asAdmin((c) =>
    c.query(`delete from public.whatsapp_accounts where tenant_id = $1`, [
      s.tenantA,
    ]),
  );
});

// ---------------------------------------------------------------------------

describe("quién puede conectar", () => {
  it("el titular conecta el número", async () => {
    expect((await conectar(s.owner)).ok).toBe(true);

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select phone_number_id, onboarding, status
         from public.whatsapp_accounts where tenant_id = $1`,
        [s.tenantA],
      );
      expect(rows[0].phone_number_id).toBe("123456789012345");
      expect(rows[0].onboarding).toBe("manual");
      // Conectada es lo que diga Meta, no lo que diga quien cargó los datos.
      expect(rows[0].status).toBe("pending");
    });
  });

  it("recepción no", async () => {
    const r = await conectar(s.reception);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/titular o administra/i);
  });

  it("una profesional tampoco", async () => {
    expect((await conectar(s.staff)).ok).toBe(false);
  });

  it("un visitante sin sesión, menos", async () => {
    await asUser(null, async (c) => {
      const code = await expectRejected(() =>
        c.query(`select public.whatsapp_connect('1','EAA-larguisimo-token-aca')`),
      );
      expect(code).toBe("42501");
    });
  });

  it("sin número o sin token no guarda nada", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select public.whatsapp_connect('', 'EAA-un-token-larguisimo') as r`,
      );
      expect((rows[0].r as R).ok).toBe(false);
    });
  });
});

describe("el token no vuelve", () => {
  it("nadie puede leer la tabla de credenciales", async () => {
    await conectar(s.owner);

    await asUser(s.owner, async (c) => {
      // Ni siquiera quien la acaba de cargar.
      const code = await expectRejected(() =>
        c.query(`select access_token from public.whatsapp_accounts`),
      );
      expect(code).toBe("42501");
    });
  });

  it("la vista muestra el estado y ninguna credencial", async () => {
    await conectar(s.owner);

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select * from public.whatsapp_status`);
      expect(rows).toHaveLength(1);
      expect(rows[0].has_token).toBe(true);
      expect(rows[0].display_phone).toBe("+5493584123456");
      expect(Object.keys(rows[0])).not.toContain("access_token");
      expect(Object.keys(rows[0])).not.toContain("app_secret");
    });
  });

  it("el negocio de al lado no ve nada", async () => {
    await conectar(s.owner);

    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select * from public.whatsapp_status`);
      expect(rows).toHaveLength(0);
    });
  });
});

describe("reconectar y desconectar", () => {
  it("volver a cargar reemplaza el token y no duplica la cuenta", async () => {
    await conectar(s.owner, "111", "EAA-token-viejo-pero-largo");
    await conectar(s.owner, "222", "EAA-token-nuevo-y-tambien-largo");

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select phone_number_id, access_token from public.whatsapp_accounts
         where tenant_id = $1`,
        [s.tenantA],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].phone_number_id).toBe("222");
      expect(rows[0].access_token).toBe("EAA-token-nuevo-y-tambien-largo");
    });
  });

  it("desconectar borra la cuenta entera", async () => {
    await conectar(s.owner);

    await comoUsuario(s.owner, async (c) => {
      const { rows } = await c.query(`select public.whatsapp_disconnect() as r`);
      expect((rows[0].r as R).ok).toBe(true);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select 1 from public.whatsapp_accounts where tenant_id = $1`,
        [s.tenantA],
      );
      // Una cuenta a medias, con estado pero sin credenciales, es peor que
      // ninguna.
      expect(rows).toHaveLength(0);
    });
  });

  it("recepción no puede desconectar", async () => {
    await conectar(s.owner);

    await asUser(s.reception, async (c) => {
      const { rows } = await c.query(`select public.whatsapp_disconnect() as r`);
      expect((rows[0].r as R).ok).toBe(false);
    });
  });
});
