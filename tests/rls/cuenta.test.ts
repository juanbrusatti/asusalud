import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAdmin, asUser, createAuthUser, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

/**
 * Lo que Dlay le cobra a cada negocio.
 *
 * Es código de plata, así que lo que se prueba no es que sepa multiplicar:
 * es que cuente los turnos correctos, que agrupe por el mes del negocio y no
 * por el del UTC, que nadie vea la cuenta de otro, y que un mes ya cobrado no
 * cambie de importe cuando suba el precio.
 */

let s: Scenario;
let branchA: string;
let tz: string;
let servicio: string;
let cliente: string;
let plataforma: string;
const correoPlataforma = "plataforma-cta@dlay.test";

type Mes = {
  periodo: string;
  link: string | null;
  cantidad: number;
  base_cents: number;
  total_cents: number;
  pagado: boolean;
  pagado_el: string | null;
};

type Cuenta = {
  comision_bps: number;
  mes_actual: {
    periodo: string;
    cantidad: number;
    base_cents: number;
    total_cents: number;
  };
  meses: Mes[];
};

type Negocio = {
  tenant_id: string;
  nombre: string;
  comision_bps: number;
  mes_actual: {
    periodo: string;
    cantidad: number;
    base_cents: number;
    total_cents: number;
  };
  pendientes: Array<{
    periodo: string;
    cantidad: number;
    base_cents: number;
    total_cents: number;
  }>;
  pendiente_total_cents: number;
  ultimo_pago: { periodo: string; monto_cents: number } | null;
};

/**
 * Un turno en un mes determinado, con su servicio.
 *
 * `mesesAtras` 0 es el mes en curso, y en ese caso se pone al principio del
 * mes: así ya pasó sin importar qué día se corran las pruebas.
 */
async function crearTurno(
  c: PoolClient,
  opciones: { mesesAtras: number; dia: number; hora: number; status: string },
) {
  // Un solo molde para todos los casos: si algún parámetro no apareciera en la
  // consulta, Postgres no podría deducir su tipo. El minuto de más hace que
  // «mes en curso, día 0, hora 0» ya haya pasado aunque las pruebas corran el
  // primero del mes.
  const base = `date_trunc('month', (now() at time zone $2))
                - make_interval(months => $3::int)
                + make_interval(days => $4::int, hours => $5::int)
                + interval '1 minute'`;

  const { rows } = await c.query(
    `insert into public.appointments
       (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until,
        status, cancelled_at, price_cents)
     values (
       $1, $6, $7,
       (${base}) at time zone $2,
       (${base} + interval '30 minutes') at time zone $2,
       (${base} + interval '30 minutes') at time zone $2,
       $8::public.appointment_status,
       -- La tabla exige que cancelado y fecha de cancelación vayan juntos.
       case when $8 = 'cancelled' then now() end,
       -- El precio del turno es la base del cobro. Al agendar de verdad lo
       -- pone book_appointment sumando los servicios; acá se insertan turnos
       -- a mano, así que hay que ponerlo.
       100000
     )
     returning id`,
    [
      s.tenantA,
      tz,
      opciones.mesesAtras,
      opciones.dia,
      opciones.hora,
      branchA,
      cliente,
      opciones.status,
    ],
  );

  await c.query(
    `insert into public.appointment_services
       (tenant_id, appointment_id, service_id, duration_minutes, buffer_minutes, price_cents, position)
     values ($1, $2, $3, 30, 0, 100000, 0)`,
    [s.tenantA, rows[0].id, servicio],
  );
}

/** Un turno que todavía no pasó. */
async function crearTurnoFuturo(c: PoolClient) {
  const { rows } = await c.query(
    `insert into public.appointments
       (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until,
        status, price_cents)
     values ($1, $2, $3,
             now() + interval '8 days',
             now() + interval '8 days 30 minutes',
             now() + interval '8 days 30 minutes',
             'confirmed', 100000)
     returning id`,
    [s.tenantA, branchA, cliente],
  );
  await c.query(
    `insert into public.appointment_services
       (tenant_id, appointment_id, service_id, duration_minutes, buffer_minutes, price_cents, position)
     values ($1, $2, $3, 30, 0, 100000, 0)`,
    [s.tenantA, rows[0].id, servicio],
  );
}

beforeAll(async () => {
  s = await setupScenario("cta");

  await asAdmin(async (c) => {
    const { rows: b } = await c.query(
      `select b.id, t.timezone from public.branches b
       join public.tenants t on t.id = b.tenant_id
       where b.tenant_id = $1 and b.is_default`,
      [s.tenantA],
    );
    branchA = b[0].id as string;
    tz = b[0].timezone as string;

    // Capacidad alta: estas pruebas apilan turnos a la misma hora a propósito
    // y lo que se mide no es la agenda.
    const { rows: sv } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Servicio cta', 30, 50, 'fixed', 100000)
       returning id`,
      [s.tenantA],
    );
    servicio = sv[0].id as string;

    const { rows: cl } = await c.query(
      `insert into public.clients (tenant_id, first_name) values ($1, 'Cuenta')
       returning id`,
      [s.tenantA],
    );
    cliente = cl[0].id as string;

    await c.query("begin");
    // Mes pasado: tres cobrables y dos que no lo son.
    await crearTurno(c, { mesesAtras: 1, dia: 5, hora: 10, status: "confirmed" });
    await crearTurno(c, { mesesAtras: 1, dia: 6, hora: 11, status: "pending" });
    await crearTurno(c, { mesesAtras: 1, dia: 7, hora: 12, status: "attended" });
    await crearTurno(c, { mesesAtras: 1, dia: 8, hora: 13, status: "cancelled" });
    await crearTurno(c, { mesesAtras: 1, dia: 9, hora: 14, status: "no_show" });

    // Dos meses atrás: uno solo.
    await crearTurno(c, { mesesAtras: 2, dia: 3, hora: 9, status: "confirmed" });

    // Mes en curso: uno que ya pasó y otro que todavía no.
    await crearTurno(c, { mesesAtras: 0, dia: 0, hora: 0, status: "confirmed" });
    await crearTurnoFuturo(c);
    await c.query("commit");
  });

  plataforma = await createAuthUser(correoPlataforma, "Dlay Plataforma");
  await asAdmin((c) =>
    c.query(`insert into public.platform_admins (user_id) values ($1)`, [
      plataforma,
    ]),
  );
});

afterAll(async () => {
  await asAdmin((c) =>
    c.query(`delete from auth.users where email = $1`, [correoPlataforma]),
  );
  await teardownScenario(s);
  await pool.end();
});

/** Un turno cancelado se cancela: el check de la tabla lo exige. */
describe("qué turnos se cobran", () => {
  it("cuenta los que ya pasaron y no se cancelaron", async () => {
    const cuenta = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select public.account_summary() as r`);
      return rows[0].r as Cuenta;
    });

    // Tres del mes pasado: confirmado, pendiente y atendido. El cancelado y el
    // ausente no entran.
    const pasado = cuenta.meses[0];
    expect(pasado.cantidad).toBe(3);
    expect(pasado.pagado).toBe(false);
  });

  it("no cobra los turnos que todavía no ocurrieron", async () => {
    const cuenta = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select public.account_summary() as r`);
      return rows[0].r as Cuenta;
    });

    // En el mes en curso hay dos turnos, pero uno es dentro de ocho días.
    expect(cuenta.mes_actual.cantidad).toBe(1);
  });

  it("cobra el porcentaje de lo facturado, no un fijo por turno", async () => {
    const cuenta = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select public.account_summary() as r`);
      return rows[0].r as Cuenta;
    });

    // 3% por defecto. Cada turno vale $1.000, o sea 100000 centavos.
    expect(cuenta.comision_bps).toBe(300);

    expect(cuenta.mes_actual.base_cents).toBe(1 * 100000);
    expect(cuenta.mes_actual.total_cents).toBe(3000);

    expect(cuenta.meses[0].base_cents).toBe(3 * 100000);
    expect(cuenta.meses[0].total_cents).toBe(9000);
  });

  it("aplica el porcentaje al total del mes y redondea una sola vez", async () => {
    // Con un porcentaje que no divide justo, redondear turno por turno y
    // después sumar daría otro número. Lo que vale es el total.
    const total = await asUser(plataforma, async (c) => {
      await c.query(`select public.platform_set_commission($1, 333)`, [
        s.tenantA,
      ]);
      const { rows } = await c.query(`select public.platform_accounts() as r`);
      const negocios = rows[0].r as Negocio[];
      return negocios.find((n) => n.tenant_id === s.tenantA)!;
    });

    // Mes pasado: base 300000, 3,33% = 9990 exactos.
    const pasado = total.pendientes.find((m) => m.base_cents === 300000)!;
    expect(pasado.total_cents).toBe(9990);
  });

  it("separa los meses", async () => {
    const cuenta = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(`select public.account_summary() as r`);
      return rows[0].r as Cuenta;
    });

    expect(cuenta.meses).toHaveLength(2);
    // El más reciente primero.
    expect(cuenta.meses[0].periodo > cuenta.meses[1].periodo).toBe(true);
    expect(cuenta.meses[1].cantidad).toBe(1);
  });
});

describe("quién puede ver la cuenta", () => {
  it("el otro negocio no ve nada de este", async () => {
    const cuenta = await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select public.account_summary() as r`);
      return rows[0].r as Cuenta;
    });

    // Ve la suya, que está vacía.
    expect(cuenta.mes_actual.cantidad).toBe(0);
    expect(cuenta.meses).toHaveLength(0);
  });

  it("quien atiende no ve la cuenta", async () => {
    await expect(
      asUser(s.staff, (c) => c.query(`select public.account_summary()`)),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("administración sí la ve", async () => {
    const cuenta = await asUser(s.admin, async (c) => {
      const { rows } = await c.query(`select public.account_summary() as r`);
      return rows[0].r as Cuenta;
    });
    expect(cuenta.meses[0].cantidad).toBe(3);
  });
});

describe("el panel de la plataforma", () => {
  it("le cierra la puerta a quien no es de Dlay", async () => {
    await expect(
      asUser(s.owner, (c) => c.query(`select public.platform_accounts()`)),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("muestra todos los negocios y lo que deben", async () => {
    const negocios = await asUser(plataforma, async (c) => {
      const { rows } = await c.query(`select public.platform_accounts() as r`);
      return rows[0].r as Negocio[];
    });

    const a = negocios.find((n) => n.tenant_id === s.tenantA)!;
    expect(a).toBeDefined();
    expect(a.mes_actual.cantidad).toBe(1);
    // Los dos meses cerrados, sin pagar: 3 + 1 turnos de $1.000 al 3%.
    expect(a.pendientes).toHaveLength(2);
    expect(a.pendiente_total_cents).toBe(9000 + 3000);
    expect(a.ultimo_pago).toBeNull();

    // El negocio B existe y no debe nada.
    const b = negocios.find((n) => n.tenant_id === s.tenantB)!;
    expect(b).toBeDefined();
    expect(b.pendiente_total_cents).toBe(0);
  });

  it("un negocio no puede marcarse pagos a sí mismo", async () => {
    await expect(
      asUser(s.owner, (c) =>
        c.query(`select public.platform_mark_paid($1, current_date)`, [
          s.tenantA,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("marcar un mes pagado", () => {
  it("no deja cobrar el mes en curso", async () => {
    const r = await asUser(plataforma, async (c) => {
      const { rows } = await c.query(
        `select public.platform_mark_paid(
           $1,
           date_trunc('month', (now() at time zone $2))::date
         ) as r`,
        [s.tenantA, tz],
      );
      return rows[0].r as { ok: boolean; error?: string };
    });

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/todavía no terminó/i);
  });

  it("congela la base y el porcentaje, y no se deja cobrar dos veces", async () => {
    await asUser(plataforma, async (c) => {
      const mesPasado = `(date_trunc('month', (now() at time zone $2)) - interval '1 month')::date`;

      const { rows: uno } = await c.query(
        `select public.platform_mark_paid($1, ${mesPasado}) as r`,
        [s.tenantA, tz],
      );
      const primero = uno[0].r as {
        ok: boolean;
        base_cents: number;
        total_cents: number;
      };
      expect(primero.ok).toBe(true);
      expect(primero.base_cents).toBe(3 * 100000);
      expect(primero.total_cents).toBe(9000);

      // Repetirlo no cobra de nuevo.
      const { rows: dos } = await c.query(
        `select public.platform_mark_paid($1, ${mesPasado}) as r`,
        [s.tenantA, tz],
      );
      expect((dos[0].r as { ok: boolean }).ok).toBe(false);

      // Sube el porcentaje: el mes ya cobrado no se mueve.
      await c.query(`select public.platform_set_commission($1, 1000)`, [
        s.tenantA,
      ]);

      const { rows: tres } = await c.query(
        `select public.platform_accounts() as r`,
      );
      const negocios = tres[0].r as Negocio[];
      const a = negocios.find((n) => n.tenant_id === s.tenantA)!;

      expect(a.comision_bps).toBe(1000);
      // Lo cobrado quedó al 3%, no al 10% de ahora.
      expect(a.ultimo_pago!.monto_cents).toBe(9000);
      // Queda pendiente sólo el mes de dos atrás, ya al porcentaje nuevo.
      expect(a.pendientes).toHaveLength(1);
      expect(a.pendientes[0].total_cents).toBe(10000);
    });
  });

  it("se puede deshacer un pago mal marcado", async () => {
    await asUser(plataforma, async (c) => {
      const mesPasado = `(date_trunc('month', (now() at time zone $2)) - interval '1 month')::date`;

      await c.query(`select public.platform_mark_paid($1, ${mesPasado})`, [
        s.tenantA,
        tz,
      ]);

      const { rows } = await c.query(
        `select public.platform_unmark_paid($1, ${mesPasado}) as r`,
        [s.tenantA, tz],
      );
      expect((rows[0].r as { ok: boolean }).ok).toBe(true);

      const { rows: otra } = await c.query(
        `select public.platform_unmark_paid($1, ${mesPasado}) as r`,
        [s.tenantA, tz],
      );
      expect((otra[0].r as { ok: boolean }).ok).toBe(false);
    });
  });
});

describe("el aviso de que cerró el mes", () => {
  /** Sin nadie con notificaciones activadas no se encola ningún aviso. */
  async function conPush(fn: () => Promise<void>) {
    await asAdmin((c) =>
      c.query(
        `insert into public.push_subscriptions
           (tenant_id, user_id, endpoint, p256dh, auth)
         values ($1, $2, 'https://push.test/cta', 'llave', 'auth')
         on conflict do nothing`,
        [s.tenantA, s.owner],
      ),
    );
    try {
      await fn();
    } finally {
      await asAdmin((c) =>
        c.query(`delete from public.push_subscriptions where tenant_id = $1`, [
          s.tenantA,
        ]),
      );
      await asAdmin((c) =>
        c.query(`delete from public.team_alerts where tenant_id = $1`, [
          s.tenantA,
        ]),
      );
    }
  }

  it("avisa una sola vez, con el mes en castellano", async () => {
    await conPush(async () => {
      const uno = await asAdmin(async (c) => {
        const { rows } = await c.query(`select app.avisar_cuentas(31) as n`);
        return rows[0].n as number;
      });
      expect(uno).toBeGreaterThanOrEqual(1);

      const aviso = await asAdmin(async (c) => {
        const { rows } = await c.query(
          `select title, body, url, tag from public.team_alerts
           where tenant_id = $1 and kind = 'cuenta'`,
          [s.tenantA],
        );
        return rows;
      });

      expect(aviso).toHaveLength(1);
      expect(aviso[0].url).toBe("/configuracion/cuenta");
      // El mes anterior, escrito como lo escribiría una persona.
      expect(aviso[0].title).toMatch(
        /^Cerró (Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)$/,
      );
      expect(aviso[0].body).toMatch(/3 turnos/);
      expect(aviso[0].tag).toMatch(/^cuenta-\d{4}-\d{2}$/);

      // Correrlo de nuevo no duplica: la etiqueta ya está.
      await asAdmin((c) => c.query(`select app.avisar_cuentas(31)`));
      const despues = await asAdmin(async (c) => {
        const { rows } = await c.query(
          `select count(*)::int n from public.team_alerts
           where tenant_id = $1 and kind = 'cuenta'`,
          [s.tenantA],
        );
        return rows[0].n as number;
      });
      expect(despues).toBe(1);
    });
  });

  it("no avisa un mes que ya está pagado", async () => {
    await conPush(async () => {
      await asAdmin((c) =>
        c.query(
          `insert into public.billing_payments
             (tenant_id, period, appointments, base_cents, commission_bps, amount_cents)
           values ($1,
                   (date_trunc('month', (now() at time zone $2)) - interval '1 month')::date,
                   3, 300000, 300, 9000)`,
          [s.tenantA, tz],
        ),
      );

      await asAdmin((c) => c.query(`select app.avisar_cuentas(31)`));

      const n = await asAdmin(async (c) => {
        const { rows } = await c.query(
          `select count(*)::int n from public.team_alerts
           where tenant_id = $1 and kind = 'cuenta'`,
          [s.tenantA],
        );
        return rows[0].n as number;
      });
      expect(n).toBe(0);

      await asAdmin((c) =>
        c.query(`delete from public.billing_payments where tenant_id = $1`, [
          s.tenantA,
        ]),
      );
    });
  });

  it("no encola nada si nadie tiene las notificaciones activadas", async () => {
    await asAdmin((c) =>
      c.query(`delete from public.team_alerts where tenant_id = $1`, [
        s.tenantA,
      ]),
    );

    await asAdmin((c) => c.query(`select app.avisar_cuentas(31)`));

    const n = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int n from public.team_alerts
         where tenant_id = $1 and kind = 'cuenta'`,
        [s.tenantA],
      );
      return rows[0].n as number;
    });
    expect(n).toBe(0);
  });
});

describe("el enlace de pago", () => {
  const MP = "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=abc";

  it("no deja guardar un enlace que no sea de Mercado Pago", async () => {
    await expect(
      asAdmin((c) =>
        c.query(
          `insert into public.billing_links (tenant_id, period, preference_id, url)
           values ($1, date_trunc('month', now())::date - interval '1 month', 'x',
                   'https://otro-sitio.com/pagar')`,
          [s.tenantA],
        ),
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("no deja cobrar un mes que todavía no cerró", async () => {
    const r = await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select public.billing_link_save(
           date_trunc('month', (now() at time zone $1))::date, 'pref', $2
         ) as r`,
        [tz, MP],
      );
      return rows[0].r as { ok: boolean; error?: string };
    });

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/todavía no cerró/i);
  });

  it("guarda el enlace del mes cerrado y lo devuelve en la cuenta", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select public.billing_link_save(
           (date_trunc('month', (now() at time zone $1)) - interval '1 month')::date,
           'pref-123', $2
         ) as r`,
        [tz, MP],
      );
      expect((rows[0].r as { ok: boolean }).ok).toBe(true);

      const { rows: cta } = await c.query(
        `select public.account_summary() as r`,
      );
      const cuenta = cta[0].r as Cuenta;
      expect(cuenta.meses[0].link).toBe(MP);
    });
  });

  it("quien atiende no puede guardar enlaces", async () => {
    const r = await asUser(s.staff, async (c) => {
      const { rows } = await c.query(
        `select public.billing_link_save(
           (date_trunc('month', (now() at time zone $1)) - interval '1 month')::date,
           'pref', $2
         ) as r`,
        [tz, MP],
      );
      return rows[0].r as { ok: boolean; error?: string };
    });
    expect(r.ok).toBe(false);
  });
});

describe("el pago que se marca solo", () => {
  /** El mes cerrado anterior, en la zona del negocio. */
  const MES_PASADO = `(date_trunc('month', (now() at time zone $1)) - interval '1 month')::date`;

  async function referencia(): Promise<string> {
    return asAdmin(async (c) => {
      const { rows } = await c.query(
        // $1 es la zona, que la usa MES_PASADO; el negocio va en $2.
        `select $2 || ':' || to_char(${MES_PASADO}, 'YYYY-MM-DD') as r`,
        [tz, s.tenantA],
      );
      return rows[0].r as string;
    });
  }

  afterEach(async () => {
    await asAdmin((c) =>
      c.query(`delete from public.billing_payments where tenant_id = $1`, [
        s.tenantA,
      ]),
    );
  });

  it("cobra el mes y deja anotado de dónde vino", async () => {
    const ref = await referencia();

    const r = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select public.rpc_mercadopago_paid($1, $2) as r`,
        [ref, "mp-1"],
      );
      return rows[0].r as { ok: boolean; total_cents: number };
    });

    expect(r.ok).toBe(true);
    expect(r.total_cents).toBe(9000);

    const fila = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select source, payment_id, amount_cents
         from public.billing_payments where tenant_id = $1`,
        [s.tenantA],
      );
      return rows[0];
    });

    expect(fila.source).toBe("mercadopago");
    expect(fila.payment_id).toBe("mp-1");
    expect(Number(fila.amount_cents)).toBe(9000);
  });

  it("un aviso repetido no cobra dos veces", async () => {
    const ref = await referencia();

    await asAdmin((c) =>
      c.query(`select public.rpc_mercadopago_paid($1, $2)`, [ref, "mp-2"]),
    );

    const otra = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select public.rpc_mercadopago_paid($1, $2) as r`,
        [ref, "mp-2"],
      );
      return rows[0].r as { ok: boolean; repetido?: boolean };
    });

    // Reintentar tiene que ser gratis: contesta que sí y no toca nada.
    expect(otra.ok).toBe(true);
    expect(otra.repetido).toBe(true);

    const cuantos = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select count(*)::int n from public.billing_payments where tenant_id = $1`,
        [s.tenantA],
      );
      return rows[0].n as number;
    });
    expect(cuantos).toBe(1);
  });

  it("no le cree a una referencia que no es de Dlay", async () => {
    for (const mala of ["cualquier-cosa", "no-es-uuid:2026-08-01", ""]) {
      const r = await asAdmin(async (c) => {
        const { rows } = await c.query(
          `select public.rpc_mercadopago_paid($1, $2) as r`,
          [mala, "mp-x"],
        );
        return rows[0].r as { ok: boolean; error?: string };
      });
      expect(r.ok).toBe(false);
    }
  });

  it("el panel y el webhook congelan lo mismo", async () => {
    const ref = await referencia();

    const porWebhook = await asAdmin(async (c) => {
      const { rows } = await c.query(
        `select public.rpc_mercadopago_paid($1, $2) as r`,
        [ref, "mp-3"],
      );
      return rows[0].r as { total_cents: number; base_cents: number };
    });

    await asAdmin((c) =>
      c.query(`delete from public.billing_payments where tenant_id = $1`, [
        s.tenantA,
      ]),
    );

    const porPanel = await asUser(plataforma, async (c) => {
      const { rows } = await c.query(
        `select public.platform_mark_paid($2, ${MES_PASADO}) as r`,
        [tz, s.tenantA],
      );
      return rows[0].r as { total_cents: number; base_cents: number };
    });

    expect(porPanel.total_cents).toBe(porWebhook.total_cents);
    expect(porPanel.base_cents).toBe(porWebhook.base_cents);
  });
});
