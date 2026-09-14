import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;
let cliente: string;

beforeAll(async () => {
  s = await setupScenario("cli");

  cliente = await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: s.owner, role: "authenticated" }),
    ]);
    const { rows } = await c.query(
      `insert into public.clients
         (tenant_id, first_name, last_name, phone_e164, phone_raw, email)
       values ($1, 'Mirián', 'Ortiz', '+5493584123456', '0358 15 412-3456',
               'mirian@example.com')
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

describe("aislamiento de la agenda de clientes", () => {
  it("el negocio vecino no ve ninguna ficha", async () => {
    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select id from public.clients`);
      expect(rows).toHaveLength(0);
    });
  });

  it("no se puede cargar una ficha en el negocio ajena", async () => {
    await asUser(s.intruder, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.clients (tenant_id, first_name) values ($1, 'Colada')`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("no se puede editar una ficha ajena", async () => {
    await asUser(s.intruder, async (c) => {
      const { rowCount } = await c.query(
        `update public.clients set first_name = 'Robada' where id = $1`,
        [cliente],
      );
      expect(rowCount).toBe(0);
    });
  });

  it("no se puede mudar una ficha propia al negocio ajena", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(`update public.clients set tenant_id = $1 where id = $2`, [
          s.tenantB,
          cliente,
        ]),
      );
      expect(code).toBe("42501");
    });
  });

  it("las notas ajenas no se leen", async () => {
    await asUser(s.owner, async (c) => {
      await c.query(
        `insert into public.client_notes (tenant_id, client_id, body)
         values ($1, $2, 'Piel sensible, bajar intensidad.')`,
        [s.tenantA, cliente],
      );
      await c.query("commit");
    });

    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select id from public.client_notes`);
      expect(rows).toHaveLength(0);
    });

    await asAdmin(async (c) => {
      await c.query(`delete from public.client_notes where client_id = $1`, [
        cliente,
      ]);
    });
  });
});

describe("quién puede trabajar con clientes", () => {
  // A diferencia del catálogo de servicios, acá escriben los cuatro roles:
  // recepción agenda y los profesionales anotan cómo fue la sesión.

  it("recepción puede cargar una ficha", async () => {
    await asUser(s.reception, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.clients (tenant_id, first_name, last_name)
         values ($1, 'Nueva', 'Cliente')`,
        [s.tenantA],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("un profesional puede editar y dejar notas", async () => {
    await asUser(s.staff, async (c) => {
      const { rowCount } = await c.query(
        `update public.clients set alert = 'Alérgica a la lidocaína' where id = $1`,
        [cliente],
      );
      expect(rowCount).toBe(1);

      const { rowCount: notas } = await c.query(
        `insert into public.client_notes (tenant_id, client_id, body, author_id)
         values ($1, $2, 'Primera sesión, buena tolerancia.', $3)`,
        [s.tenantA, cliente, s.staff],
      );
      expect(notas).toBe(1);
    });
  });

  it("una nota no se puede editar, sólo agregar otra", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `insert into public.client_notes (tenant_id, client_id, body)
         values ($1, $2, 'Original') returning id`,
        [s.tenantA, cliente],
      );
      const code = await expectRejected(() =>
        c.query(`update public.client_notes set body = 'Editada' where id = $1`, [
          rows[0].id,
        ]),
      );
      // No hay GRANT de UPDATE sobre la tabla.
      expect(code).toBe("42501");
    });
  });

  it("recepción no puede borrar una ficha", async () => {
    await asUser(s.reception, async (c) => {
      const { rowCount } = await c.query(
        `delete from public.clients where id = $1`,
        [cliente],
      );
      expect(rowCount).toBe(0);
    });
  });

  it("administración sí puede borrar", async () => {
    await asUser(s.admin, async (c) => {
      const { rows } = await c.query(
        `insert into public.clients (tenant_id, first_name)
         values ($1, 'Descartable') returning id`,
        [s.tenantA],
      );
      const { rowCount } = await c.query(
        `delete from public.clients where id = $1`,
        [rows[0].id],
      );
      expect(rowCount).toBe(1);
    });
  });
});

describe("calidad de los datos de contacto", () => {
  it("rechaza un teléfono que no esté en formato internacional", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.clients (tenant_id, first_name, phone_e164)
           values ($1, 'Mal', '03584123456')`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it("rechaza un correo sin forma de correo", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.clients (tenant_id, first_name, email)
           values ($1, 'Mal', 'esto no es un mail')`,
          [s.tenantA],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it("acepta una ficha sin teléfono ni correo", async () => {
    // Pasa constantemente: alguien deja el nombre y nada más.
    await asUser(s.owner, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.clients (tenant_id, first_name) values ($1, 'Anónima')`,
        [s.tenantA],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("permite dos personas con el mismo teléfono", async () => {
    // La madre saca turno para la hija con su propio número.
    await asUser(s.owner, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.clients (tenant_id, first_name, last_name, phone_e164)
         values ($1, 'Hija', 'Ortiz', '+5493584123456')`,
        [s.tenantA],
      );
      expect(rowCount).toBe(1);

      const { rows } = await c.query(
        `select public.count_phone_duplicates($1) as n`,
        [cliente],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it("los duplicados no cruzan negocios", async () => {
    await asUser(s.intruder, async (c) => {
      await c.query(
        `insert into public.clients (tenant_id, first_name, phone_e164)
         values ($1, 'Homónima', '+5493584123456')`,
        [s.tenantB],
      );
      await c.query("commit");
    });

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select public.count_phone_duplicates($1) as n`,
        [cliente],
      );
      expect(rows[0].n).toBe(0);
    });

    await asAdmin(async (c) => {
      await c.query(
        `delete from public.clients where tenant_id = $1 and first_name = 'Homónima'`,
        [s.tenantB],
      );
    });
  });
});

describe("búsqueda", () => {
  it("encuentra sin acentos y sin importar mayúsculas", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select first_name from public.clients
         where tenant_id = $1 and search_text like '%mirian%'`,
        [s.tenantA],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].first_name).toBe("Mirián");
    });
  });

  it("encuentra por teléfono tal como lo escribieron", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select id from public.clients
         where tenant_id = $1 and search_text like '%412-3456%'`,
        [s.tenantA],
      );
      expect(rows.map((r) => r.id)).toContain(cliente);
    });
  });
});

describe("preferencia de canal", () => {
  it("registra quién la decidió", async () => {
    await asUser(s.reception, async (c) => {
      await c.query(
        `update public.clients set channel_mode = 'whatsapp' where id = $1`,
        [cliente],
      );

      const { rows } = await c.query(
        `select channel_mode, channel_decided_by, channel_decided_at
         from public.clients where id = $1`,
        [cliente],
      );
      expect(rows[0].channel_mode).toBe("whatsapp");
      expect(rows[0].channel_decided_by).toBe(s.reception);
      expect(rows[0].channel_decided_at).not.toBeNull();
    });
  });

  it("volver a automático borra el rastro de la decisión", async () => {
    await asUser(s.reception, async (c) => {
      await c.query(
        `update public.clients set channel_mode = 'email' where id = $1`,
        [cliente],
      );
      await c.query(
        `update public.clients set channel_mode = 'auto' where id = $1`,
        [cliente],
      );

      const { rows } = await c.query(
        `select channel_decided_by, channel_decided_at
         from public.clients where id = $1`,
        [cliente],
      );
      expect(rows[0].channel_decided_by).toBeNull();
      expect(rows[0].channel_decided_at).toBeNull();
    });
  });

  it("una ficha nueva arranca en automático", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `insert into public.clients (tenant_id, first_name)
         values ($1, 'Recién') returning channel_mode, channel_decided_by`,
        [s.tenantA],
      );
      expect(rows[0].channel_mode).toBe("auto");
      expect(rows[0].channel_decided_by).toBeNull();
    });
  });
});

describe("etiquetas", () => {
  it("cualquiera del equipo puede crearlas, sólo owner y admin borrarlas", async () => {
    const tag = await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.staff, role: "authenticated" }),
      ]);
      const { rows } = await c.query(
        `insert into public.client_tags (tenant_id, name) values ($1, 'VIP')
         returning id`,
        [s.tenantA],
      );
      await c.query("select set_config('request.jwt.claims', '', false)");
      return rows[0].id as string;
    });

    await asUser(s.staff, async (c) => {
      const { rowCount } = await c.query(
        `delete from public.client_tags where id = $1`,
        [tag],
      );
      expect(rowCount).toBe(0);
    });

    await asUser(s.owner, async (c) => {
      const { rowCount } = await c.query(
        `delete from public.client_tags where id = $1`,
        [tag],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("no se puede etiquetar a alguien de otro negocio", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `insert into public.client_tags (tenant_id, name) values ($1, 'Prueba')
         returning id`,
        [s.tenantA],
      );
      const code = await expectRejected(() =>
        c.query(
          `insert into public.client_tag_assignments (tenant_id, client_id, tag_id)
           values ($1, $2, $3)`,
          [s.tenantB, cliente, rows[0].id],
        ),
      );
      expect(code).toBe("42501");
    });
  });
});
