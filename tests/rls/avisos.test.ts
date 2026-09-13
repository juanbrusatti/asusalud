import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, expectRejected, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * Avisos al equipo y notificaciones para la clienta.
 *
 * Lo que más importa probar no es que el aviso salga, sino **que no salga**
 * cuando lo hizo el equipo: avisarle a alguien de lo que acaba de hacer es la
 * forma más rápida de que apague las notificaciones para siempre.
 */

let s: Scenario;
let branchA: string;
let servicio: string;
let cliente: string;

/** Alguien del equipo con las notificaciones activadas. */
async function equipoSuscripto(sufijo = "1") {
  await asAdmin((c) =>
    c.query(
      `insert into public.push_subscriptions
         (tenant_id, user_id, endpoint, p256dh, auth)
       values ($1, $2, $3, 'clave-p256dh', 'clave-auth')
       on conflict (endpoint) do nothing`,
      [s.tenantA, s.owner, `https://push.test/equipo-${sufijo}`],
    ),
  );
}

async function crearTurno(opciones: {
  source?: string;
  horas?: number;
  status?: string;
}): Promise<{ id: string; token: string }> {
  return asAdmin(async (c) => {
    await c.query("begin");
    const { rows } = await c.query(
      `insert into public.appointments
         (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until,
          status, source)
       values ($1, $2, $3,
         now() + make_interval(hours => $4),
         now() + make_interval(hours => $4, mins => 40),
         now() + make_interval(hours => $4, mins => 40),
         $5::public.appointment_status, $6::public.appointment_source)
       returning id, manage_token`,
      [
        s.tenantA,
        branchA,
        cliente,
        opciones.horas ?? 48,
        opciones.status ?? "confirmed",
        opciones.source ?? "staff",
      ],
    );
    await c.query(
      `insert into public.appointment_services
         (tenant_id, appointment_id, service_id, duration_minutes, buffer_minutes, price_cents, position)
       values ($1, $2, $3, 40, 0, 350000, 0)`,
      [s.tenantA, rows[0].id, servicio],
    );
    await c.query("commit");
    return { id: rows[0].id as string, token: rows[0].manage_token as string };
  });
}

/** Como visitante sin sesión y sin revertir: acá se miran los efectos. */
async function comoVisitante<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return asAdmin(async (c) => {
    await c.query("set role anon");
    try {
      return await fn(c);
    } finally {
      await c.query("reset role").catch(() => {});
    }
  });
}

async function avisos(): Promise<
  Array<{ kind: string; title: string; body: string; url: string }>
> {
  return asAdmin(async (c) => {
    const { rows } = await c.query(
      `select kind, title, body, url from public.team_alerts
       where tenant_id = $1 order by created_at`,
      [s.tenantA],
    );
    return rows;
  });
}

beforeAll(async () => {
  s = await setupScenario("avi");

  await asAdmin(async (c) => {
    const { rows: b } = await c.query(
      `select id from public.branches where tenant_id = $1 and is_default`,
      [s.tenantA],
    );
    branchA = b[0].id as string;

    await c.query(
      `update public.booking_settings
       set enabled = true, self_manage = true, cancel_min_hours = 24
       where tenant_id = $1`,
      [s.tenantA],
    );

    const { rows: sv } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Masaje avi', 40, 1, 'fixed', 350000) returning id`,
      [s.tenantA],
    );
    servicio = sv[0].id as string;

    const { rows: cl } = await c.query(
      `insert into public.clients (tenant_id, first_name, last_name)
       values ($1, 'Mirián', 'Ortiz') returning id`,
      [s.tenantA],
    );
    cliente = cl[0].id as string;
  });
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

beforeEach(async () => {
  await asAdmin(async (c) => {
    await c.query(`delete from public.appointments where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.team_alerts where tenant_id = $1`, [s.tenantA]);
    await c.query(`delete from public.push_subscriptions where tenant_id = $1`, [
      s.tenantA,
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("qué merece un aviso", () => {
  it("una reserva online avisa al equipo", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "online" });

    const [aviso] = await avisos();
    expect(aviso.kind).toBe("booking");
    expect(aviso.title).toBe("Reserva nueva");
    // Con el nombre, la hora y el servicio se decide sin abrir la aplicación.
    expect(aviso.body).toContain("Mirián Ortiz");
    expect(aviso.body).toContain("Masaje avi");
  });

  it("un turno que carga el equipo no avisa a nadie", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "staff" });

    // Avisarle a alguien de lo que acaba de hacer es ruido.
    expect(await avisos()).toEqual([]);
  });

  it("una cancelación de la clienta avisa", async () => {
    await equipoSuscripto();
    const t = await crearTurno({ source: "online" });
    await asAdmin((c) =>
      c.query(`delete from public.team_alerts where tenant_id = $1`, [s.tenantA]),
    );

    await comoVisitante((c) =>
      c.query(`select public.booking_cancel($1, null)`, [t.token]),
    );

    const [aviso] = await avisos();
    expect(aviso.kind).toBe("cancel");
    expect(aviso.body).toContain("El horario quedó libre");
    // Al tocarla se abre ese turno, no la agenda entera.
    expect(aviso.url).toBe(`/agenda/${t.id}`);
  });

  it("una cancelación del equipo no avisa", async () => {
    await equipoSuscripto();
    const t = await crearTurno({ source: "online" });
    await asAdmin(async (c) => {
      await c.query(`delete from public.team_alerts where tenant_id = $1`, [s.tenantA]);
      await c.query(
        `update public.appointments
         set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Avisó por teléfono'
         where id = $1`,
        [t.id],
      );
    });

    expect(await avisos()).toEqual([]);
  });

  it("una reprogramación dice de dónde a dónde", async () => {
    await equipoSuscripto();
    const t = await crearTurno({ source: "staff" });

    await comoVisitante((c) =>
      c.query(
        `select public.booking_reschedule($1, now() + interval '72 hours')`,
        [t.token],
      ),
    );

    const [aviso] = await avisos();
    expect(aviso.kind).toBe("reschedule");
    expect(aviso.body).toMatch(/pasó del .* al /);
  });

  it("sin nadie suscripto no se encola nada", async () => {
    await crearTurno({ source: "online" });

    // Una cola de avisos que nunca van a poder entregarse es basura que hay
    // que limpiar después.
    expect(await avisos()).toEqual([]);
  });
});

describe("la cola", () => {
  it("se toma una vez y suma intentos", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "online" });

    await asAdmin(async (c) => {
      // El emisor vacía la cola entera, de todas las estéticas: acá se filtra
      // a la propia para no depender de lo que haya dejado otra prueba.
      const { rows: primera } = await c.query(
        `select * from public.rpc_claim_team_alerts(50) where tenant_id = $1`,
        [s.tenantA],
      );
      expect(primera).toHaveLength(1);
      expect(primera[0].attempts).toBe(1);

      // Ya tomada, pero sin cerrar: se vuelve a intentar hasta agotar los tres.
      const { rows: segunda } = await c.query(
        `select * from public.rpc_claim_team_alerts(50) where tenant_id = $1`,
        [s.tenantA],
      );
      expect(segunda[0].attempts).toBe(2);
    });
  });

  it("lo enviado no se vuelve a tomar", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "online" });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select * from public.rpc_claim_team_alerts(50) where tenant_id = $1`,
        [s.tenantA],
      );
      await c.query(`select public.rpc_finish_team_alert($1, true, null)`, [
        rows[0].id,
      ]);

      const { rows: otra } = await c.query(
        `select * from public.rpc_claim_team_alerts(50) where tenant_id = $1`,
        [s.tenantA],
      );
      expect(otra).toHaveLength(0);
    });
  });

  it("a los tres intentos se deja de probar", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "online" });

    await asAdmin(async (c) => {
      for (let i = 0; i < 3; i += 1) {
        const { rows } = await c.query(
          `select * from public.rpc_claim_team_alerts(50) where tenant_id = $1`,
          [s.tenantA],
        );
        await c.query(`select public.rpc_finish_team_alert($1, false, 'push 500')`, [
          rows[0].id,
        ]);
      }

      const { rows: cerrado } = await c.query(
        `select failed_at, last_error from public.team_alerts where tenant_id = $1`,
        [s.tenantA],
      );
      // Un aviso que llegara ahora ya no serviría para nada.
      expect(cerrado[0].failed_at).not.toBeNull();
      expect(cerrado[0].last_error).toBe("push 500");

      const { rows: mas } = await c.query(
        `select * from public.rpc_claim_team_alerts(50) where tenant_id = $1`,
        [s.tenantA],
      );
      expect(mas).toHaveLength(0);
    });
  });
});

describe("quién ve los avisos", () => {
  it("el equipo ve los de su estética", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "online" });

    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select id from public.team_alerts`);
      expect(rows).toHaveLength(1);
    });
  });

  it("la estética de al lado no ve ninguno", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "online" });

    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select id from public.team_alerts`);
      expect(rows).toHaveLength(0);
    });
  });

  it("nadie los edita ni los borra a mano", async () => {
    await equipoSuscripto();
    await crearTurno({ source: "online" });

    await asUser(s.owner, async (c) => {
      // Son una bitácora además de una cola: si se pudieran editar, no
      // servirían para discutir si el aviso llegó.
      const code = await expectRejected(() =>
        c.query(`update public.team_alerts set title = 'otro'`),
      );
      expect(code).toBe("42501");
    });
  });
});

describe("la clienta acepta las notificaciones", () => {
  it("el token de su turno alcanza para suscribirse", async () => {
    const t = await crearTurno({ source: "online" });

    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select public.booking_subscribe_push($1, $2, 'p256', 'auth', 'iPhone') as r`,
        [t.token, "https://push.test/clienta-1"],
      );
      expect((rows[0].r as { ok: boolean }).ok).toBe(true);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select client_id, user_id, tenant_id from public.push_subscriptions
         where endpoint = 'https://push.test/clienta-1'`,
      );
      // Queda colgada de la ficha, no de un usuario del equipo.
      expect(rows[0].client_id).toBe(cliente);
      expect(rows[0].user_id).toBeNull();
      expect(rows[0].tenant_id).toBe(s.tenantA);
    });
  });

  it("un token inventado no suscribe a nadie", async () => {
    await comoVisitante(async (c) => {
      const { rows } = await c.query(
        `select public.booking_subscribe_push($1, $2, 'p256', 'auth', null) as r`,
        ["noexisteestetokenparanada00000000", "https://push.test/intruso"],
      );
      expect((rows[0].r as { ok: boolean }).ok).toBe(false);
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select id from public.push_subscriptions where endpoint = 'https://push.test/intruso'`,
      );
      expect(rows).toHaveLength(0);
    });
  });

  it("un visitante no puede elegir a qué clienta suscribir", async () => {
    await asUser(null, async (c) => {
      // `register_push_subscription` acepta un client_id cualquiera y por eso
      // sigue estando prohibida para quien no tiene sesión.
      const code = await expectRejected(() =>
        c.query(
          `select public.register_push_subscription('https://push.test/x', 'p', 'a', null, $1)`,
          [cliente],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("volver a aceptar en el mismo navegador no falla", async () => {
    const t = await crearTurno({ source: "online" });

    await comoVisitante(async (c) => {
      for (const clave of ["p256-viejo", "p256-nuevo"]) {
        const { rows } = await c.query(
          `select public.booking_subscribe_push($1, $2, $3, 'auth', null) as r`,
          [t.token, "https://push.test/repetida", clave],
        );
        expect((rows[0].r as { ok: boolean }).ok).toBe(true);
      }
    });

    await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select p256dh from public.push_subscriptions
         where endpoint = 'https://push.test/repetida'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].p256dh).toBe("p256-nuevo");
    });
  });
});
