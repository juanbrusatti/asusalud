import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, expectRejected, flush, pool } from "./helpers";
import { setupScenario, teardownScenario, type Scenario } from "./fixtures";

let s: Scenario;
let branchA: string;
let clienta: string;
/** Depilación: 40 minutos, 10 de limpieza, dos personas a la vez. */
let depilacion: string;
/** Masaje: 60 minutos, una sola persona a la vez. */
let masaje: string;

/** Lunes 14 de septiembre de 2026 a las 09:00, hora argentina. */
const LUNES_9 = "2026-09-14T12:00:00Z";

/** Arma un turno completo: cabecera + servicios, con la ventana coherente. */
async function agendar(
  c: import("pg").PoolClient,
  {
    startsAt,
    serviceId,
    durationMinutes,
    bufferMinutes = 0,
    status = "confirmed",
    tenantId = s.tenantA,
    branchId = branchA,
  }: {
    startsAt: string;
    serviceId: string;
    durationMinutes: number;
    bufferMinutes?: number;
    status?: string;
    tenantId?: string;
    branchId?: string;
  },
) {
  const { rows } = await c.query(
    `insert into public.appointments
       (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until, status)
     values (
       $1, $2, $3, $4::timestamptz,
       $4::timestamptz + make_interval(mins => $5::int),
       $4::timestamptz + make_interval(mins => $5::int + $6::int),
       $7::public.appointment_status
     )
     returning id`,
    [tenantId, branchId, clienta, startsAt, durationMinutes, bufferMinutes, status],
  );

  const id = rows[0].id as string;

  await c.query(
    `insert into public.appointment_services
       (tenant_id, appointment_id, service_id, duration_minutes, buffer_minutes)
     values ($1, $2, $3, $4, $5)`,
    [tenantId, id, serviceId, durationMinutes, bufferMinutes],
  );

  return id;
}

beforeAll(async () => {
  s = await setupScenario("age");

  const setup = await asAdmin(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: s.owner, role: "authenticated" }),
    ]);

    const { rows: branches } = await c.query(
      `select id from public.branches where tenant_id = $1 and is_default`,
      [s.tenantA],
    );

    const { rows: cli } = await c.query(
      `insert into public.clients (tenant_id, first_name, last_name)
       values ($1, 'Mirián', 'Ortiz') returning id`,
      [s.tenantA],
    );

    const { rows: dep } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, buffer_minutes, capacity,
          price_mode, price_cents)
       values ($1, 'Depilación Definitiva', 40, 10, 2, 'fixed', 1000000)
       returning id`,
      [s.tenantA],
    );

    const { rows: mas } = await c.query(
      `insert into public.services
         (tenant_id, name, duration_minutes, capacity, price_mode, price_cents)
       values ($1, 'Masaje descontracturante', 60, 1, 'fixed', 350000)
       returning id`,
      [s.tenantA],
    );

    await c.query("select set_config('request.jwt.claims', '', false)");

    return {
      branch: branches[0].id as string,
      client: cli[0].id as string,
      dep: dep[0].id as string,
      mas: mas[0].id as string,
    };
  });

  branchA = setup.branch;
  clienta = setup.client;
  depilacion = setup.dep;
  masaje = setup.mas;
});

afterAll(async () => {
  await teardownScenario(s);
  await pool.end();
});

// ---------------------------------------------------------------------------

describe("cupos simultáneos", () => {
  it("un servicio de a uno no admite dos turnos pisados", async () => {
    await asUser(s.owner, async (c) => {
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      // Media hora después: se pisa con el anterior.
      await agendar(c, {
        startsAt: "2026-09-14T12:30:00Z",
        serviceId: masaje,
        durationMinutes: 60,
      });

      const code = await expectRejected(() => flush(c));
      // 23P01 = exclusion_violation: no hay lugar.
      expect(code).toBe("23P01");
    });
  });

  it("un servicio de a dos admite dos y rechaza el tercero", async () => {
    await asUser(s.owner, async (c) => {
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: depilacion,
        durationMinutes: 40,
        bufferMinutes: 10,
      });
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: depilacion,
        durationMinutes: 40,
        bufferMinutes: 10,
      });
      // Dos a la vez es exactamente lo que Asusalud hace todos los días.
      await flush(c);

      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: depilacion,
        durationMinutes: 40,
        bufferMinutes: 10,
      });
      const code = await expectRejected(() => flush(c));
      expect(code).toBe("23P01");
    });
  });

  it("el rato de limpieza también ocupa lugar", async () => {
    await asUser(s.owner, async (c) => {
      // 09:00 a 09:40, más 10 de limpieza: la agenda queda ocupada hasta 09:50.
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 40,
        bufferMinutes: 10,
      });
      await flush(c);

      // Las 09:45 caen dentro de la limpieza.
      await agendar(c, {
        startsAt: "2026-09-14T12:45:00Z",
        serviceId: masaje,
        durationMinutes: 60,
      });
      const code = await expectRejected(() => flush(c));
      expect(code).toBe("23P01");
    });
  });

  it("pegado al final del anterior sí entra", async () => {
    await asUser(s.owner, async (c) => {
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 40,
        bufferMinutes: 10,
      });
      // 09:50 en punto: justo cuando termina la limpieza.
      await agendar(c, {
        startsAt: "2026-09-14T12:50:00Z",
        serviceId: masaje,
        durationMinutes: 60,
      });
      await expect(flush(c)).resolves.toBeUndefined();
    });
  });

  it("cancelar libera el lugar", async () => {
    await asUser(s.owner, async (c) => {
      const primero = await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      await c.query(
        `update public.appointments
         set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Avisó'
         where id = $1`,
        [primero],
      );

      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await expect(flush(c)).resolves.toBeUndefined();
    });
  });

  it("una ausencia también libera el lugar", async () => {
    await asUser(s.owner, async (c) => {
      const primero = await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      await c.query(
        `update public.appointments set status = 'no_show' where id = $1`,
        [primero],
      );
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await expect(flush(c)).resolves.toBeUndefined();
    });
  });

  it("servicios distintos no se estorban entre sí", async () => {
    // La capacidad es por servicio. Un límite global por profesional llega
    // cuando haya más de una; hoy sería inventar una regla que nadie pidió.
    await asUser(s.owner, async (c) => {
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: depilacion,
        durationMinutes: 40,
        bufferMinutes: 10,
      });
      await expect(flush(c)).resolves.toBeUndefined();
    });
  });

  it("dos reservas al mismo tiempo no se cuelan las dos", async () => {
    // Sin el bloqueo consultivo, las dos contarían los turnos que había antes
    // de la otra, las dos pasarían la verificación y el cupo quedaría excedido.
    const uno = await pool.connect();
    const dos = await pool.connect();

    try {
      for (const c of [uno, dos]) {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: s.owner, role: "authenticated" }),
        ]);
      }

      await agendar(uno, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await agendar(dos, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });

      // La primera en cerrar se queda con el lugar; la segunda espera el
      // bloqueo y después descubre que ya no hay.
      await uno.query("commit");

      const code = await expectRejected(() => dos.query("commit"));
      expect(code).toBe("23P01");
    } finally {
      await uno.query("rollback").catch(() => {});
      await dos.query("rollback").catch(() => {});
      await asAdmin(async (c) => {
        await c.query(`delete from public.appointments where tenant_id = $1`, [
          s.tenantA,
        ]);
      });
      uno.release();
      dos.release();
    }
  });
});

describe("coherencia del turno", () => {
  it("un turno sin servicios no se guarda", async () => {
    await asUser(s.owner, async (c) => {
      await c.query(
        `insert into public.appointments
           (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until)
         values ($1, $2, $3, $4::timestamptz,
                 $4::timestamptz + interval '30 min',
                 $4::timestamptz + interval '30 min')`,
        [s.tenantA, branchA, clienta, LUNES_9],
      );
      const code = await expectRejected(() => flush(c));
      expect(code).toBe("23514");
    });
  });

  it("la duración tiene que coincidir con la de sus servicios", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `insert into public.appointments
           (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until)
         values ($1, $2, $3, $4::timestamptz,
                 $4::timestamptz + interval '30 min',
                 $4::timestamptz + interval '30 min')
         returning id`,
        [s.tenantA, branchA, clienta, LUNES_9],
      );
      // El servicio dura 60, pero el turno dice 30.
      await c.query(
        `insert into public.appointment_services
           (tenant_id, appointment_id, service_id, duration_minutes)
         values ($1, $2, $3, 60)`,
        [s.tenantA, rows[0].id, masaje],
      );

      const code = await expectRejected(() => flush(c));
      expect(code).toBe("23514");
    });
  });

  it("un turno no puede terminar antes de empezar", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `insert into public.appointments
             (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until)
           values ($1, $2, $3, $4::timestamptz,
                   $4::timestamptz - interval '10 min',
                   $4::timestamptz)`,
          [s.tenantA, branchA, clienta, LUNES_9],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it("cancelado sin fecha de cancelación no se acepta", async () => {
    await asUser(s.owner, async (c) => {
      const id = await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      const code = await expectRejected(() =>
        c.query(
          `update public.appointments set status = 'cancelled' where id = $1`,
          [id],
        ),
      );
      expect(code).toBe("23514");
    });
  });
});

describe("historial de estados", () => {
  it("registra el alta y cada cambio con su autor", async () => {
    await asUser(s.owner, async (c) => {
      const id = await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
        status: "pending",
      });
      await flush(c);

      await c.query(
        `update public.appointments set status = 'confirmed' where id = $1`,
        [id],
      );
      await c.query(
        `update public.appointments set status = 'attended' where id = $1`,
        [id],
      );

      const { rows } = await c.query(
        `select from_status, to_status, changed_by
         from public.appointment_status_history
         where appointment_id = $1 order by created_at`,
        [id],
      );

      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.to_status)).toEqual([
        "pending",
        "confirmed",
        "attended",
      ]);
      expect(rows[0].from_status).toBeNull();
      expect(rows[2].from_status).toBe("confirmed");
      expect(rows[2].changed_by).toBe(s.owner);
    });
  });

  it("guardar sin cambiar el estado no ensucia el historial", async () => {
    await asUser(s.owner, async (c) => {
      const id = await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      await c.query(`update public.appointments set notes = 'Llega tarde' where id = $1`, [id]);

      const { rows } = await c.query(
        `select count(*)::int as n from public.appointment_status_history
         where appointment_id = $1`,
        [id],
      );
      expect(rows[0].n).toBe(1);
    });
  });
});

describe("aislamiento de la agenda", () => {
  it("la estética vecina no ve los turnos", async () => {
    await asAdmin(async (c) => {
      await c.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: s.owner, role: "authenticated" }),
      ]);
      await c.query("begin");
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await c.query("commit");
      await c.query("select set_config('request.jwt.claims', '', false)");
    });

    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select id from public.appointments`);
      expect(rows).toHaveLength(0);
    });

    await asAdmin(async (c) => {
      await c.query(`delete from public.appointments where tenant_id = $1`, [
        s.tenantA,
      ]);
    });
  });

  it("no se puede agendar en la estética ajena", async () => {
    await asUser(s.intruder, async (c) => {
      const code = await expectRejected(() =>
        agendar(c, {
          startsAt: LUNES_9,
          serviceId: masaje,
          durationMinutes: 60,
          tenantId: s.tenantA,
        }),
      );
      expect(code).toBe("42501");
    });
  });

  it("no se puede usar un servicio de otra estética", async () => {
    await asUser(s.intruder, async (c) => {
      const { rows: branchB } = await c.query(
        `select id from public.branches where tenant_id = $1 and is_default`,
        [s.tenantB],
      );
      const { rows: cliB } = await c.query(
        `insert into public.clients (tenant_id, first_name)
         values ($1, 'Ajena') returning id`,
        [s.tenantB],
      );

      const { rows: appt } = await c.query(
        `insert into public.appointments
           (tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until)
         values ($1, $2, $3, $4::timestamptz,
                 $4::timestamptz + interval '60 min',
                 $4::timestamptz + interval '60 min')
         returning id`,
        [s.tenantB, branchB[0].id, cliB[0].id, LUNES_9],
      );

      // El servicio pertenece a la otra estética: la RLS no lo deja referenciar.
      const code = await expectRejected(() =>
        c.query(
          `insert into public.appointment_services
             (tenant_id, appointment_id, service_id, duration_minutes)
           values ($1, $2, $3, 60)`,
          [s.tenantA, appt[0].id, masaje],
        ),
      );
      expect(code).toBe("42501");
    });
  });
});

describe("quién puede hacer qué", () => {
  it("recepción agenda", async () => {
    await asUser(s.reception, async (c) => {
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await expect(flush(c)).resolves.toBeUndefined();
    });
  });

  it("una profesional marca que la clienta no vino", async () => {
    await asUser(s.staff, async (c) => {
      const id = await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      const { rowCount } = await c.query(
        `update public.appointments set status = 'no_show' where id = $1`,
        [id],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("administración no puede borrar un turno, sólo cancelarlo", async () => {
    await asUser(s.admin, async (c) => {
      const id = await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      const { rowCount } = await c.query(
        `delete from public.appointments where id = $1`,
        [id],
      );
      expect(rowCount).toBe(0);
    });
  });

  it("un servicio con turnos no se puede borrar", async () => {
    await asUser(s.owner, async (c) => {
      await agendar(c, {
        startsAt: LUNES_9,
        serviceId: masaje,
        durationMinutes: 60,
      });
      await flush(c);

      const code = await expectRejected(() =>
        c.query(`delete from public.services where id = $1`, [masaje]),
      );
      // 23503 = la clave foránea con ON DELETE RESTRICT lo impide.
      expect(code).toBe("23503");
    });
  });
});

describe("bloqueos de agenda", () => {
  it("se crean y se ven dentro de la estética", async () => {
    await asUser(s.reception, async (c) => {
      const { rowCount } = await c.query(
        `insert into public.agenda_blocks
           (tenant_id, branch_id, starts_at, ends_at, reason)
         values ($1, $2, $3::timestamptz, $3::timestamptz + interval '4 h',
                 'Turno médico')`,
        [s.tenantA, branchA, LUNES_9],
      );
      expect(rowCount).toBe(1);
    });
  });

  it("no se ven desde otra estética", async () => {
    await asAdmin(async (c) => {
      await c.query(
        `insert into public.agenda_blocks
           (tenant_id, branch_id, starts_at, ends_at)
         values ($1, $2, $3::timestamptz, $3::timestamptz + interval '2 h')`,
        [s.tenantA, branchA, LUNES_9],
      );
    });

    await asUser(s.intruder, async (c) => {
      const { rows } = await c.query(`select id from public.agenda_blocks`);
      expect(rows).toHaveLength(0);
    });

    await asAdmin(async (c) => {
      await c.query(`delete from public.agenda_blocks where tenant_id = $1`, [
        s.tenantA,
      ]);
    });
  });
});

describe("agendar desde la aplicación", () => {
  it("escribe turno y servicios en una sola transacción", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], $3::timestamptz, 'Viene con su hermana') as id`,
        [clienta, [depilacion], LUNES_9],
      );
      const id = rows[0].id as string;

      const { rows: turno } = await c.query(
        `select starts_at, ends_at, blocks_until, price_cents, notes, status
         from public.appointments where id = $1`,
        [id],
      );

      // 40 de atención y 10 de limpieza: la base los calculó sola.
      expect(
        (new Date(turno[0].ends_at).getTime() -
          new Date(turno[0].starts_at).getTime()) /
          60000,
      ).toBe(40);
      expect(
        (new Date(turno[0].blocks_until).getTime() -
          new Date(turno[0].ends_at).getTime()) /
          60000,
      ).toBe(10);
      expect(Number(turno[0].price_cents)).toBe(1000000);
      expect(turno[0].notes).toBe("Viene con su hermana");
      expect(turno[0].status).toBe("confirmed");
    });
  });

  it("suma las duraciones cuando son varios servicios", async () => {
    await asUser(s.owner, async (c) => {
      const { rows } = await c.query(
        `select public.book_appointment($1, $2::uuid[], $3::timestamptz) as id`,
        [clienta, [depilacion, masaje], LUNES_9],
      );

      const { rows: servicios } = await c.query(
        `select position, duration_minutes from public.appointment_services
         where appointment_id = $1 order by position`,
        [rows[0].id],
      );
      // Conserva el orden en que se eligieron.
      expect(servicios.map((r) => r.duration_minutes)).toEqual([40, 60]);

      const { rows: turno } = await c.query(
        `select (extract(epoch from (ends_at - starts_at)) / 60)::int as mins,
                price_cents
         from public.appointments where id = $1`,
        [rows[0].id],
      );
      expect(turno[0].mins).toBe(100);
      expect(Number(turno[0].price_cents)).toBe(1350000);
    });
  });

  it("si no hay lugar, el turno entero se deshace", async () => {
    await asUser(s.owner, async (c) => {
      await c.query(
        `select public.book_appointment($1, $2::uuid[], $3::timestamptz)`,
        [clienta, [masaje], LUNES_9],
      );
      await flush(c);

      // El segundo se escribe sin chistar: la verificación de cupos es
      // diferida y salta al cerrar. Como todo vive en la misma transacción,
      // el rechazo se lleva puesto también a sus servicios.
      await c.query(
        `select public.book_appointment($1, $2::uuid[], $3::timestamptz)`,
        [clienta, [masaje], LUNES_9],
      );

      const code = await expectRejected(() => flush(c));
      expect(code).toBe("23P01");
    });
  });

  it("no deja agendar con un servicio de otra estética", async () => {
    await asUser(s.intruder, async (c) => {
      const { rows: cliB } = await c.query(
        `insert into public.clients (tenant_id, first_name)
         values ($1, 'Ajena') returning id`,
        [s.tenantB],
      );
      const code = await expectRejected(() =>
        c.query(
          `select public.book_appointment($1, $2::uuid[], $3::timestamptz)`,
          [cliB[0].id, [masaje], LUNES_9],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("no deja agendar para una ficha de otra estética", async () => {
    await asUser(s.intruder, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `select public.book_appointment($1, $2::uuid[], $3::timestamptz)`,
          [clienta, [masaje], LUNES_9],
        ),
      );
      expect(code).toBe("42501");
    });
  });

  it("un turno sin servicios se rechaza con un mensaje claro", async () => {
    await asUser(s.owner, async (c) => {
      const code = await expectRejected(() =>
        c.query(
          `select public.book_appointment($1, $2::uuid[], $3::timestamptz)`,
          [clienta, [], LUNES_9],
        ),
      );
      expect(code).toBe("23514");
    });
  });
});
