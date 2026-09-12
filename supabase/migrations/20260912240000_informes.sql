-- ============================================================================
-- Dlay Estética · Informes
--
-- Un solo viaje a la base devuelve el período entero. Son seis preguntas
-- distintas sobre las mismas fechas; hacerlas por separado desde la aplicación
-- serían seis consultas que además podrían no coincidir entre sí si alguien
-- cobra justo en el medio.
--
-- Dos números que parecen el mismo y no lo son, y por eso la pantalla los
-- muestra separados:
--
--   · LO COBRADO sale de la caja: plata que entró de verdad, con su medio de
--     pago. Es lo que cierra con el cajón.
--   · LO FACTURADO sale del precio de los turnos atendidos. Sirve para saber
--     qué servicio deja más, aunque todavía no esté cobrado.
--
-- Si el segundo es mucho mayor que el primero, o falta cargar cobros o hay
-- gente debiendo. Las dos cosas conviene saberlas.
-- ============================================================================

create or replace function public.report_period(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_branch uuid;
  v_tz     text;
  v_from   timestamptz;
  v_to     timestamptz;
  v_out    jsonb;
begin
  if p_to < p_from then
    raise exception 'El período termina antes de empezar.' using errcode = '22007';
  end if;

  -- Un año entero de una sola vez es un informe que nadie pidió y una consulta
  -- que barre toda la tabla.
  if p_to - p_from > 366 then
    raise exception 'El período no puede pasar de un año.' using errcode = '22023';
  end if;

  select b.id, t.timezone into v_branch, v_tz
  from public.branches b
  join public.tenants t on t.id = b.tenant_id
  where b.is_default
  limit 1;

  if v_branch is null then
    return null;
  end if;

  -- Las fechas que se eligen en pantalla son días de la estética, no del UTC:
  -- un cobro de las 22:30 del lunes pertenece al lunes aunque en Londres ya
  -- sea martes.
  v_from := (p_from::timestamp) at time zone v_tz;
  v_to   := ((p_to + 1)::timestamp) at time zone v_tz;

  select jsonb_build_object(
    'from', p_from,
    'to',   p_to,

    -- ---------------------------------------------------------------------
    -- Lo que entró y salió por la caja
    -- ---------------------------------------------------------------------
    'money', jsonb_build_object(
      'incomeCents', (
        select coalesce(sum(m.amount_cents) filter (where m.kind = 'income'), 0)
        from public.cash_movements m
        where m.created_at >= v_from and m.created_at < v_to
      ),
      'expenseCents', (
        select coalesce(sum(m.amount_cents) filter (where m.kind = 'expense'), 0)
        from public.cash_movements m
        where m.created_at >= v_from and m.created_at < v_to
      ),
      'byMethod', coalesce((
        select jsonb_agg(
                 jsonb_build_object('method', x.method, 'cents', x.cents)
                 order by x.cents desc
               )
        from (
          select m.method,
                 sum(case when m.kind = 'income'
                          then m.amount_cents else -m.amount_cents end) as cents
          from public.cash_movements m
          where m.created_at >= v_from and m.created_at < v_to
          group by m.method
          having sum(case when m.kind = 'income'
                          then m.amount_cents else -m.amount_cents end) <> 0
        ) x
      ), '[]'::jsonb)
    ),

    -- ---------------------------------------------------------------------
    -- Cómo se portó la agenda
    -- ---------------------------------------------------------------------
    'agenda', (
      select jsonb_build_object(
        'total',     count(*),
        'attended',  count(*) filter (where a.status = 'attended'),
        'noShow',    count(*) filter (where a.status = 'no_show'),
        'cancelled', count(*) filter (where a.status = 'cancelled'),
        'upcoming',  count(*) filter (where a.status in ('pending', 'confirmed')),
        'online',    count(*) filter (where a.source = 'online'),
        -- Los cancelados no ocupan la agenda: el horario quedó libre.
        'bookedMinutes', coalesce(sum(
          extract(epoch from (a.ends_at - a.starts_at)) / 60
        ) filter (where a.status <> 'cancelled'), 0)::int
      )
      from public.appointments a
      where a.starts_at >= v_from and a.starts_at < v_to
    ),

    -- Cuántos minutos de atención tuvo el período según los horarios. Es el
    -- denominador de la ocupación: sin esto, "200 minutos agendados" no dice
    -- si fue un día lleno o uno muerto.
    'openMinutes', coalesce((
      select sum(extract(epoch from (bh.closes_at - bh.opens_at)) / 60)
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
      join public.business_hours bh
        on bh.branch_id = v_branch
       and bh.weekday = extract(dow from d)::smallint
    ), 0)::int,

    -- ---------------------------------------------------------------------
    -- Qué servicio deja más
    -- ---------------------------------------------------------------------
    'services', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',           x.id,
                 'name',         x.name,
                 'count',        x.cnt,
                 'revenueCents', x.rev,
                 'minutes',      x.mins
               ) order by x.rev desc, x.cnt desc
             )
      from (
        select sv.id,
               coalesce(sv.name, 'Servicio eliminado') as name,
               count(*)                                as cnt,
               coalesce(sum(asv.price_cents), 0)       as rev,
               coalesce(sum(asv.duration_minutes), 0)  as mins
        from public.appointment_services asv
        join public.appointments a on a.id = asv.appointment_id
        left join public.services sv on sv.id = asv.service_id
        where a.starts_at >= v_from
          and a.starts_at < v_to
          and a.status = 'attended'
        group by sv.id, sv.name
      ) x
    ), '[]'::jsonb),

    -- ---------------------------------------------------------------------
    -- ¿Sirven los recordatorios?
    --
    -- La comparación honesta es entre turnos ya resueltos: de los que
    -- recibieron aviso faltó tanto por ciento, de los que no, tanto otro. Un
    -- turno que todavía no pasó no dice nada todavía.
    -- ---------------------------------------------------------------------
    'reminders', (
      select jsonb_build_object(
        'withReminder', jsonb_build_object(
          'total',   count(*) filter (where r.avisado),
          'noShows', count(*) filter (where r.avisado and r.status = 'no_show')
        ),
        'without', jsonb_build_object(
          'total',   count(*) filter (where not r.avisado),
          'noShows', count(*) filter (where not r.avisado and r.status = 'no_show')
        )
      )
      from (
        select a.status,
               exists (
                 select 1
                 from public.message_jobs j
                 where j.appointment_id = a.id
                   and j.status = 'sent'
                   and not j.was_test
               ) as avisado
        from public.appointments a
        where a.starts_at >= v_from
          and a.starts_at < v_to
          and a.status in ('attended', 'no_show')
      ) r
    ),

    -- ---------------------------------------------------------------------
    -- Cuánto costó avisar
    --
    -- El punto de todo el sistema de recordatorios es que esta cifra tienda a
    -- cero. Va en el informe para que se vea si eso se cumple.
    -- ---------------------------------------------------------------------
    'messages', (
      select jsonb_build_object(
        'sent',     count(*),
        'costCents', coalesce(sum(j.cost_cents), 0),
        'byChannel', coalesce((
          select jsonb_agg(jsonb_build_object('channel', y.channel, 'count', y.cnt)
                           order by y.cnt desc)
          from (
            select k.channel, count(*) as cnt
            from public.message_jobs k
            where k.sent_at >= v_from and k.sent_at < v_to
              and k.status = 'sent'
              and not k.was_test
            group by k.channel
          ) y
        ), '[]'::jsonb)
      )
      from public.message_jobs j
      where j.sent_at >= v_from and j.sent_at < v_to
        and j.status = 'sent'
        and not j.was_test
    )
  ) into v_out;

  return v_out;
end;
$$;

comment on function public.report_period(date, date) is
  'Todo el informe de un período en una sola llamada. Respeta la RLS: quien no '
  'puede ver la caja recibe los totales de plata en cero, no un error.';

revoke all on function public.report_period(date, date) from public;
grant execute on function public.report_period(date, date) to authenticated;
