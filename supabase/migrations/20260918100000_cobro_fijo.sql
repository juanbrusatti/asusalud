-- ============================================================================
-- Dlay Agenda · Cobrar por porcentaje o por un fijo
--
-- Hay clientes que no quieren trabajar por porcentaje. Perder el cliente por
-- eso es peor que cobrarle distinto, así que ahora cada negocio tiene su forma
-- de cobro y el porcentaje sigue siendo la de fábrica.
--
-- Tres piezas, de la más general a la más puntual:
--
-- · **La forma**: porcentaje de lo facturado, o un importe fijo por mes.
-- · **El importe fijo**, cuando la forma es fija.
-- · **El importe de un mes en particular**, para cuando hay que apartarse de
--   lo pactado: un mes flojo que se perdona, un acuerdo puntual. Gana sobre
--   todo lo demás, en cualquiera de las dos formas.
--
-- El importe de un mes se decide en un solo lugar —`app.importe_mes`— y de ahí
-- lo leen la pantalla del negocio, el panel, el cobro y los dos recordatorios.
-- Con la cuenta repartida en cinco lugares, la pantalla y la factura terminan
-- diciendo números distintos y nadie se entera hasta que alguien reclama.
--
-- Lo ya cobrado no se toca: cada pago congeló su importe cuando se marcó.
-- ============================================================================

alter table public.billing_settings
  add column mode text not null default 'percent'
    check (mode in ('percent', 'fixed')),
  add column fixed_cents bigint not null default 0
    check (fixed_cents >= 0);

comment on column public.billing_settings.mode is
  'Cómo se le cobra a este negocio: `percent` sobre lo facturado, o `fixed` '
  'un importe por mes.';

-- Para saber después cómo se cobró cada mes, sin tener que deducirlo.
alter table public.billing_payments
  add column mode text not null default 'percent'
    check (mode in ('percent', 'fixed'));

-- ---------------------------------------------------------------------------
-- El importe puesto a mano para un mes
-- ---------------------------------------------------------------------------
create table public.billing_amounts (
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  period       date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  note         text,
  created_at   timestamptz not null default now(),

  constraint billing_amounts_pkey primary key (tenant_id, period),
  constraint billing_amounts_period_is_month
    check (period = date_trunc('month', period)::date),
  constraint billing_amounts_note_len
    check (note is null or char_length(note) <= 300)
);

comment on table public.billing_amounts is
  'El importe de un mes puesto a mano, que gana sobre la forma de cobro '
  'pactada. Para apartarse de lo acordado sin cambiar el acuerdo.';

alter table public.billing_amounts enable row level security;
alter table public.billing_amounts force row level security;

create policy "billing_amounts: ver el propio"
  on public.billing_amounts for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.billing_amounts from anon, authenticated;
grant select on public.billing_amounts to authenticated;

-- ---------------------------------------------------------------------------
-- Cuánto se cobra por un mes
-- ---------------------------------------------------------------------------
-- El único lugar donde se decide. Todo lo demás pregunta acá.
create or replace function app.importe_mes(
  p_tenant uuid,
  p_period date,
  p_base   bigint
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    -- Lo puesto a mano para este mes gana sobre todo.
    (select ba.amount_cents
     from public.billing_amounts ba
     where ba.tenant_id = p_tenant and ba.period = p_period),
    (select case
       when bs.mode = 'fixed' then bs.fixed_cents
       else app.comision(p_base, bs.commission_bps)
     end
     from public.billing_settings bs
     where bs.tenant_id = p_tenant),
    -- Sin ajustes cargados, el 3% de fábrica.
    app.comision(p_base, 300)
  );
$$;

comment on function app.importe_mes(uuid, date, bigint) is
  'Lo que hay que cobrarle a un negocio por un mes: el importe puesto a mano '
  'si lo hay, y si no lo que diga su forma de cobro.';

-- ---------------------------------------------------------------------------
-- Tu cuenta, para el negocio
-- ---------------------------------------------------------------------------
create or replace function public.account_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_tz     text;
  v_modo   text;
  v_bps    integer;
  v_fijo   bigint;
  v_mes    date;
  v_cant   integer;
  v_base   bigint;
begin
  select t.id, t.timezone into v_tenant, v_tz
  from public.tenants t
  limit 1;

  if v_tenant is null then
    return null;
  end if;

  if not (select app.has_role(v_tenant, 'owner', 'admin')) then
    raise exception 'Sólo la dueña o administración pueden ver la cuenta.'
      using errcode = '42501';
  end if;

  select bs.mode, bs.commission_bps, bs.fixed_cents
    into v_modo, v_bps, v_fijo
  from public.billing_settings bs
  where bs.tenant_id = v_tenant;

  v_modo := coalesce(v_modo, 'percent');
  v_bps  := coalesce(v_bps, 300);
  v_fijo := coalesce(v_fijo, 0);
  v_mes  := date_trunc('month', (now() at time zone v_tz))::date;

  select coalesce(bp.cantidad, 0), coalesce(bp.base_cents, 0)
    into v_cant, v_base
  from app.billable_periods(v_tenant) bp
  where bp.period = v_mes;

  v_cant := coalesce(v_cant, 0);
  v_base := coalesce(v_base, 0);

  return jsonb_build_object(
    'modo',         v_modo,
    'comision_bps', v_bps,
    'fijo_cents',   v_fijo,
    'mes_actual', jsonb_build_object(
      'periodo',     v_mes,
      'cantidad',    v_cant,
      'base_cents',  v_base,
      'total_cents', app.importe_mes(v_tenant, v_mes, v_base)
    ),
    'meses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'periodo',      bp.period,
          'cantidad',     coalesce(pg.appointments, bp.cantidad),
          'base_cents',   coalesce(pg.base_cents, bp.base_cents),
          'comision_bps', coalesce(pg.commission_bps, v_bps),
          'modo',         coalesce(pg.mode, v_modo),
          'total_cents',  coalesce(
                            pg.amount_cents,
                            app.importe_mes(v_tenant, bp.period, bp.base_cents)
                          ),
          'pagado',       pg.id is not null,
          'pagado_el',    pg.paid_at,
          'link',         bl.url
        )
        order by bp.period desc
      )
      from app.billable_periods(v_tenant) bp
      left join public.billing_payments pg
        on pg.tenant_id = v_tenant and pg.period = bp.period
      left join public.billing_links bl
        on bl.tenant_id = v_tenant and bl.period = bp.period
      where bp.period < v_mes
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- El panel
-- ---------------------------------------------------------------------------
create or replace function public.platform_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(fila order by fila->>'nombre'), '[]'::jsonb)
  into v_out
  from (
    select jsonb_build_object(
      'tenant_id',    t.id,
      'nombre',       t.name,
      'slug',         t.slug,
      'estado',       t.status,
      'creado',       t.created_at,
      'modo',         coalesce(bs.mode, 'percent'),
      'comision_bps', coalesce(bs.commission_bps, 300),
      'fijo_cents',   coalesce(bs.fixed_cents, 0),
      'mes_actual', jsonb_build_object(
        'periodo',     mes.valor,
        'cantidad',    coalesce(curso.cantidad, 0),
        'base_cents',  coalesce(curso.base_cents, 0),
        'total_cents', app.importe_mes(t.id, mes.valor, coalesce(curso.base_cents, 0))
      ),
      'pendientes',            coalesce(deuda.lista, '[]'::jsonb),
      'pendiente_total_cents', coalesce(deuda.total, 0),
      'ultimo_pago',           ultimo.info
    ) as fila
    from public.tenants t
    left join public.billing_settings bs on bs.tenant_id = t.id

    cross join lateral (
      select date_trunc('month', (now() at time zone t.timezone))::date as valor
    ) mes

    left join lateral (
      select bp.cantidad, bp.base_cents
      from app.billable_periods(t.id) bp
      where bp.period = mes.valor
    ) curso on true

    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'periodo',     bp.period,
            'cantidad',    bp.cantidad,
            'base_cents',  bp.base_cents,
            'total_cents', app.importe_mes(t.id, bp.period, bp.base_cents),
            -- Para que el panel pueda mostrar cuándo el importe se puso a mano.
            'a_mano', exists (
              select 1 from public.billing_amounts ba
              where ba.tenant_id = t.id and ba.period = bp.period
            )
          )
          order by bp.period desc
        ) as lista,
        sum(app.importe_mes(t.id, bp.period, bp.base_cents)) as total
      from app.billable_periods(t.id) bp
      left join public.billing_payments pg
        on pg.tenant_id = t.id and pg.period = bp.period
      where bp.period < mes.valor
        and pg.id is null
    ) deuda on true

    left join lateral (
      select jsonb_build_object(
        'periodo',      pg.period,
        'monto_cents',  pg.amount_cents,
        'fecha',        pg.paid_at
      ) as info
      from public.billing_payments pg
      where pg.tenant_id = t.id
      order by pg.period desc
      limit 1
    ) ultimo on true
  ) s;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobrar un mes
-- ---------------------------------------------------------------------------
create or replace function app.marcar_pagado(
  p_tenant     uuid,
  p_period     date,
  p_note       text default null,
  p_payment_id text default null,
  p_source     text default 'manual',
  p_por        uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_mes   date;
  v_cant  integer;
  v_base  bigint;
  v_bps   integer;
  v_modo  text;
  v_total bigint;
begin
  select t.timezone into v_tz from public.tenants t where t.id = p_tenant;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'No existe ese negocio.');
  end if;

  p_period := date_trunc('month', p_period)::date;
  v_mes    := date_trunc('month', (now() at time zone v_tz))::date;

  if p_period >= v_mes then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese mes todavía no terminó. Se cobra cuando cierra.'
    );
  end if;

  select bp.cantidad, bp.base_cents into v_cant, v_base
  from app.billable_periods(p_tenant) bp
  where bp.period = p_period;

  if coalesce(v_cant, 0) = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese mes no tuvo turnos para cobrar.'
    );
  end if;

  select coalesce(bs.commission_bps, 300), coalesce(bs.mode, 'percent')
    into v_bps, v_modo
  from public.tenants t
  left join public.billing_settings bs on bs.tenant_id = t.id
  where t.id = p_tenant;

  v_total := app.importe_mes(p_tenant, p_period, coalesce(v_base, 0));

  insert into public.billing_payments
    (tenant_id, period, appointments, base_cents, commission_bps, mode,
     amount_cents, note, payment_id, source, created_by)
  values
    (p_tenant, p_period, v_cant, coalesce(v_base, 0), v_bps, v_modo, v_total,
     nullif(btrim(p_note), ''), nullif(btrim(p_payment_id), ''),
     p_source, p_por)
  on conflict (tenant_id, period) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese mes ya figuraba pagado.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'periodo', p_period,
    'cantidad', v_cant,
    'base_cents', coalesce(v_base, 0),
    'total_cents', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- La forma de cobro, desde el panel
-- ---------------------------------------------------------------------------
drop function if exists public.platform_set_commission(uuid, integer);

create or replace function public.platform_set_billing(
  p_tenant      uuid,
  p_mode        text,
  p_bps         integer,
  p_fixed_cents bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  if p_mode not in ('percent', 'fixed') then
    return jsonb_build_object('ok', false, 'error', 'Esa forma de cobro no existe.');
  end if;

  if p_bps is null or p_bps < 0 or p_bps > 10000 then
    return jsonb_build_object(
      'ok', false,
      'error', 'El porcentaje tiene que estar entre 0 y 100.'
    );
  end if;

  if p_fixed_cents is null or p_fixed_cents < 0 then
    return jsonb_build_object('ok', false, 'error', 'El importe no puede ser negativo.');
  end if;

  if p_mode = 'fixed' and p_fixed_cents = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Un cobro fijo de cero no cobra nada. Poné el importe.'
    );
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    return jsonb_build_object('ok', false, 'error', 'No existe ese negocio.');
  end if;

  insert into public.billing_settings
    (tenant_id, mode, commission_bps, fixed_cents, updated_at)
  values (p_tenant, p_mode, p_bps, p_fixed_cents, now())
  on conflict (tenant_id) do update
    set mode           = excluded.mode,
        commission_bps = excluded.commission_bps,
        fixed_cents    = excluded.fixed_cents,
        updated_at     = now();

  return jsonb_build_object(
    'ok', true, 'modo', p_mode,
    'comision_bps', p_bps, 'fijo_cents', p_fixed_cents
  );
end;
$$;

comment on function public.platform_set_billing(uuid, text, integer, bigint) is
  'Cambia cómo se le cobra a un negocio. Los meses ya cobrados no se tocan: '
  'cada pago congeló su importe al marcarse.';

revoke all on function public.platform_set_billing(uuid, text, integer, bigint)
  from public, anon;
grant execute on function public.platform_set_billing(uuid, text, integer, bigint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- El importe de un mes, a mano
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_month_amount(
  p_tenant       uuid,
  p_period       date,
  p_amount_cents bigint,
  p_note         text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  p_period := date_trunc('month', p_period)::date;

  if exists (
    select 1 from public.billing_payments bp
    where bp.tenant_id = p_tenant and bp.period = p_period
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese mes ya está cobrado: el importe quedó congelado.'
    );
  end if;

  -- Nulo borra el importe puesto a mano y el mes vuelve a lo pactado.
  if p_amount_cents is null then
    delete from public.billing_amounts
    where tenant_id = p_tenant and period = p_period;
    return jsonb_build_object('ok', true, 'a_mano', false);
  end if;

  if p_amount_cents < 0 then
    return jsonb_build_object('ok', false, 'error', 'El importe no puede ser negativo.');
  end if;

  insert into public.billing_amounts (tenant_id, period, amount_cents, note)
  values (p_tenant, p_period, p_amount_cents, nullif(btrim(p_note), ''))
  on conflict (tenant_id, period) do update
    set amount_cents = excluded.amount_cents,
        note         = excluded.note,
        created_at   = now();

  return jsonb_build_object('ok', true, 'a_mano', true, 'total_cents', p_amount_cents);
end;
$$;

comment on function public.platform_set_month_amount(uuid, date, bigint, text) is
  'Pone a mano el importe de un mes, o lo borra con nulo para volver a lo '
  'pactado. No toca un mes ya cobrado.';

revoke all on function public.platform_set_month_amount(uuid, date, bigint, text)
  from public, anon;
grant execute on function public.platform_set_month_amount(uuid, date, bigint, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Los recordatorios, con el mismo importe
-- ---------------------------------------------------------------------------
create or replace function public.platform_nudge(
  p_tenant uuid,
  p_period date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_mes    date;
  v_cant   integer;
  v_base   bigint;
  v_total  bigint;
  v_nombre text;
  v_tag    text;
  v_veces  integer;
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  select t.timezone into v_tz
  from public.tenants t
  where t.id = p_tenant;

  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'No existe ese negocio.');
  end if;

  p_period := date_trunc('month', p_period)::date;
  v_mes    := date_trunc('month', (now() at time zone v_tz))::date;

  if p_period >= v_mes then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese mes todavía no cerró: no hay nada que recordar.'
    );
  end if;

  if exists (
    select 1 from public.billing_payments bp
    where bp.tenant_id = p_tenant and bp.period = p_period
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese mes ya está pagado.');
  end if;

  select bp.cantidad, bp.base_cents into v_cant, v_base
  from app.billable_periods(p_tenant) bp
  where bp.period = p_period;

  v_total := app.importe_mes(p_tenant, p_period, coalesce(v_base, 0));

  if coalesce(v_cant, 0) = 0 or v_total = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese mes no tiene nada para cobrar.'
    );
  end if;

  insert into public.billing_nudges (tenant_id, period)
  values (p_tenant, p_period)
  on conflict (tenant_id, period) do update
    set times        = public.billing_nudges.times + 1,
        last_at      = now(),
        dismissed_at = null
  returning times into v_veces;

  v_nombre := app.mes_en_letras(p_period);
  v_tag    := 'recordatorio-cuenta-' || to_char(p_period, 'YYYY-MM');

  delete from public.team_alerts ta
  where ta.tenant_id = p_tenant
    and ta.tag = v_tag
    and ta.sent_at is null
    and ta.failed_at is null;

  if exists (
    select 1 from public.push_subscriptions ps
    where ps.tenant_id = p_tenant and ps.user_id is not null
  ) then
    insert into public.team_alerts (tenant_id, kind, title, body, url, tag)
    values (
      p_tenant,
      'cuenta',
      'La cuenta de ' || v_nombre,
      'Quedó pendiente el pago de ' || v_nombre || ': $ '
        || app.pesos(v_total) || '. Entrá para verla.',
      '/configuracion/cuenta',
      v_tag
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'periodo', p_period,
    'total_cents', v_total,
    'veces', v_veces
  );
end;
$$;

create or replace function public.billing_nudge()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  r        record;
begin
  select t.id into v_tenant from public.tenants t limit 1;

  if v_tenant is null then
    return null;
  end if;

  if not (select app.has_role(v_tenant, 'owner', 'admin')) then
    return null;
  end if;

  select bn.period, bn.times, bn.last_at, bp.base_cents
    into r
  from public.billing_nudges bn
  join app.billable_periods(v_tenant) bp on bp.period = bn.period
  left join public.billing_payments pg
    on pg.tenant_id = bn.tenant_id and pg.period = bn.period
  where bn.tenant_id = v_tenant
    and bn.dismissed_at is null
    and pg.id is null
  order by bn.period
  limit 1;

  if r.period is null then
    return null;
  end if;

  return jsonb_build_object(
    'periodo',     r.period,
    'veces',       r.times,
    'ultimo',      r.last_at,
    'total_cents', app.importe_mes(v_tenant, r.period, r.base_cents)
  );
end;
$$;

create or replace function app.avisar_cuentas(p_dias integer default 7)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r        record;
  v_hoy    date;
  v_mes    date;
  v_previo date;
  v_cant   integer;
  v_base   bigint;
  v_total  bigint;
  v_tag    text;
  v_nombre text;
  v_cuerpo text;
  v_salidos integer := 0;
begin
  for r in
    select t.id, t.timezone
    from public.tenants t
    where t.status = 'active'
  loop
    v_hoy    := (now() at time zone r.timezone)::date;
    v_mes    := date_trunc('month', v_hoy)::date;
    v_previo := (v_mes - interval '1 month')::date;

    if extract(day from v_hoy) > p_dias then
      continue;
    end if;

    v_tag := 'cuenta-' || to_char(v_previo, 'YYYY-MM');

    if exists (
      select 1 from public.team_alerts ta
      where ta.tenant_id = r.id and ta.tag = v_tag
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.billing_payments bp
      where bp.tenant_id = r.id and bp.period = v_previo
    ) then
      continue;
    end if;

    select bp.cantidad, bp.base_cents into v_cant, v_base
    from app.billable_periods(r.id) bp
    where bp.period = v_previo;

    if coalesce(v_cant, 0) = 0 then
      continue;
    end if;

    v_total := app.importe_mes(r.id, v_previo, coalesce(v_base, 0));

    if v_total = 0 then
      continue;
    end if;

    if not exists (
      select 1 from public.push_subscriptions ps
      where ps.tenant_id = r.id and ps.user_id is not null
    ) then
      continue;
    end if;

    v_nombre := app.mes_en_letras(v_previo);
    v_cuerpo := 'Tu cuenta de ' || v_nombre || ': $ ' || app.pesos(v_total)
                || ' por ' || v_cant || ' turnos. Entrá para pagarla.';

    insert into public.team_alerts (tenant_id, kind, title, body, url, tag)
    values (
      r.id, 'cuenta', 'Cerró ' || initcap(v_nombre), v_cuerpo,
      '/configuracion/cuenta', v_tag
    );

    v_salidos := v_salidos + 1;
  end loop;

  return v_salidos;
end;
$$;
