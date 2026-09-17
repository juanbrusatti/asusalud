-- ============================================================================
-- Dlay Agenda · De precio fijo por turno a porcentaje
--
-- Cobrar $300 por turno trata igual a un turno de $1.000 y a uno de $25.000.
-- En el primero es el 30% y en el segundo el 1,2%: el mismo número, dos
-- negocios distintos. El porcentaje arregla eso solo.
--
-- Y arregla algo que en Argentina importa más: un precio escrito en pesos hay
-- que renegociarlo con cada cliente cada pocos meses. Un porcentaje no se
-- desactualiza nunca.
--
-- Dos decisiones:
--
-- · **Se guarda en puntos básicos, no en decimales.** 3% es 300. Es la misma
--   disciplina que los centavos: con coma flotante, sumar mil turnos da un
--   total que no cierra.
--
-- · **El porcentaje se aplica al total del mes, no turno por turno.** Redondear
--   cada turno y después sumar no da lo mismo que sumar y redondear una vez, y
--   la segunda forma es la que se puede explicar en una línea: «el 3% de lo que
--   facturaste este mes».
--
-- La base es el precio del turno —la suma de sus servicios al agendarlo—, no
-- lo que entró por caja. Un negocio que no carga los cobros igual usó el
-- sistema. Los servicios «a convenir» no tienen precio, así que no suman.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El porcentaje de cada negocio
-- ---------------------------------------------------------------------------
alter table public.billing_settings
  add column commission_bps integer not null default 300
    check (commission_bps >= 0 and commission_bps <= 10000);

comment on column public.billing_settings.commission_bps is
  'Lo que Dlay se lleva de cada turno, en puntos básicos: 300 es 3%.';

alter table public.billing_settings drop column price_cents;

-- ---------------------------------------------------------------------------
-- Los pagos pasan a guardar la base y el porcentaje
-- ---------------------------------------------------------------------------
-- La tabla está vacía: el panel se estrenó hace un rato y todavía no tiene
-- acceso nadie. Si tuviera filas habría que convertirlas, no borrarlas.
alter table public.billing_payments
  add column base_cents bigint not null default 0 check (base_cents >= 0),
  add column commission_bps integer not null default 300
    check (commission_bps >= 0 and commission_bps <= 10000);

alter table public.billing_payments drop column price_cents;

comment on column public.billing_payments.base_cents is
  'Lo que el negocio facturó ese mes. Congelado al cobrar, junto con el '
  'porcentaje, para que el histórico no cambie si mañana cambia la comisión.';

-- ---------------------------------------------------------------------------
-- Los meses cobrables, ahora con su base
-- ---------------------------------------------------------------------------
drop function if exists app.billable_periods(uuid);

create or replace function app.billable_periods(p_tenant uuid)
returns table (period date, cantidad integer, base_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    date_trunc('month', (a.starts_at at time zone t.timezone))::date as period,
    count(*)::integer,
    coalesce(sum(a.price_cents), 0)::bigint
  from public.appointments a
  join public.tenants t on t.id = a.tenant_id
  where a.tenant_id = p_tenant
    -- Ya pasó. No se cobra por adelantado.
    and a.starts_at < now()
    and a.status not in ('cancelled', 'no_show')
  group by 1;
$$;

comment on function app.billable_periods(uuid) is
  'Cuántos turnos cobrables tuvo cada mes y cuánto sumaron, agrupados por el '
  'mes del negocio y no por el del UTC.';

-- Una sola forma de aplicar el porcentaje, para que la pantalla del negocio y
-- el panel no puedan llegar a números distintos.
create or replace function app.comision(p_base bigint, p_bps integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(p_base, 0) * coalesce(p_bps, 0) / 10000.0)::bigint;
$$;

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
  v_bps    integer;
  v_mes    date;
  v_cant   integer;
  v_base   bigint;
begin
  -- La RLS de `tenants` ya deja ver solamente el negocio propio.
  select t.id, t.timezone into v_tenant, v_tz
  from public.tenants t
  limit 1;

  if v_tenant is null then
    return null;
  end if;

  -- Lo que el negocio le paga a Dlay es de quien lo dirige. Quien atiende no
  -- tiene por qué ver la factura, igual que no ve la caja.
  if not (select app.has_role(v_tenant, 'owner', 'admin')) then
    raise exception 'Sólo la dueña o administración pueden ver la cuenta.'
      using errcode = '42501';
  end if;

  select bs.commission_bps into v_bps
  from public.billing_settings bs
  where bs.tenant_id = v_tenant;

  v_bps := coalesce(v_bps, 300);
  v_mes := date_trunc('month', (now() at time zone v_tz))::date;

  select coalesce(bp.cantidad, 0), coalesce(bp.base_cents, 0)
    into v_cant, v_base
  from app.billable_periods(v_tenant) bp
  where bp.period = v_mes;

  v_cant := coalesce(v_cant, 0);
  v_base := coalesce(v_base, 0);

  return jsonb_build_object(
    'comision_bps', v_bps,
    'mes_actual', jsonb_build_object(
      'periodo',     v_mes,
      'cantidad',    v_cant,
      'base_cents',  v_base,
      'total_cents', app.comision(v_base, v_bps)
    ),
    'meses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'periodo',      bp.period,
          'cantidad',     coalesce(pg.appointments, bp.cantidad),
          'base_cents',   coalesce(pg.base_cents, bp.base_cents),
          'comision_bps', coalesce(pg.commission_bps, v_bps),
          -- Para un mes ya cobrado vale lo que se cobró, no lo que valdría hoy.
          'total_cents',  coalesce(pg.amount_cents, app.comision(bp.base_cents, v_bps)),
          'pagado',       pg.id is not null,
          'pagado_el',    pg.paid_at
        )
        order by bp.period desc
      )
      from app.billable_periods(v_tenant) bp
      left join public.billing_payments pg
        on pg.tenant_id = v_tenant and pg.period = bp.period
      where bp.period < v_mes
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- El panel de la plataforma
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
      'comision_bps', coalesce(bs.commission_bps, 300),
      'mes_actual', jsonb_build_object(
        'periodo',     mes.valor,
        'cantidad',    coalesce(curso.cantidad, 0),
        'base_cents',  coalesce(curso.base_cents, 0),
        'total_cents', app.comision(
                         coalesce(curso.base_cents, 0),
                         coalesce(bs.commission_bps, 300))
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

    -- Los meses cerrados que todavía nadie marcó como pagados.
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'periodo',     bp.period,
            'cantidad',    bp.cantidad,
            'base_cents',  bp.base_cents,
            'total_cents', app.comision(bp.base_cents, coalesce(bs.commission_bps, 300))
          )
          order by bp.period desc
        ) as lista,
        sum(app.comision(bp.base_cents, coalesce(bs.commission_bps, 300))) as total
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
-- Marcar un mes como pagado
-- ---------------------------------------------------------------------------
create or replace function public.platform_mark_paid(
  p_tenant uuid,
  p_period date,
  p_note   text default null
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
  v_bps    integer;
  v_total  bigint;
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  select t.timezone into v_tz from public.tenants t where t.id = p_tenant;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'No existe ese negocio.');
  end if;

  p_period := date_trunc('month', p_period)::date;
  v_mes    := date_trunc('month', (now() at time zone v_tz))::date;

  -- El mes en curso no se cobra: todavía le pueden entrar turnos.
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

  select coalesce(bs.commission_bps, 300) into v_bps
  from public.tenants t
  left join public.billing_settings bs on bs.tenant_id = t.id
  where t.id = p_tenant;

  v_total := app.comision(v_base, v_bps);

  insert into public.billing_payments
    (tenant_id, period, appointments, base_cents, commission_bps,
     amount_cents, note, created_by)
  values
    (p_tenant, p_period, v_cant, coalesce(v_base, 0), v_bps,
     v_total, nullif(btrim(p_note), ''), (select auth.uid()))
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
-- Cambiar el porcentaje de un negocio
-- ---------------------------------------------------------------------------
drop function if exists public.platform_set_price(uuid, bigint);

create or replace function public.platform_set_commission(
  p_tenant uuid,
  p_bps    integer
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

  if p_bps is null or p_bps < 0 or p_bps > 10000 then
    return jsonb_build_object(
      'ok', false,
      'error', 'El porcentaje tiene que estar entre 0 y 100.'
    );
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    return jsonb_build_object('ok', false, 'error', 'No existe ese negocio.');
  end if;

  insert into public.billing_settings (tenant_id, commission_bps, updated_at)
  values (p_tenant, p_bps, now())
  on conflict (tenant_id) do update
    set commission_bps = excluded.commission_bps,
        updated_at     = now();

  return jsonb_build_object('ok', true, 'comision_bps', p_bps);
end;
$$;

comment on function public.platform_set_commission(uuid, integer) is
  'Cambia el porcentaje que se le cobra a un negocio. Los meses ya cobrados '
  'no se tocan: guardaron su base y su porcentaje al pagarse.';

revoke all on function public.platform_set_commission(uuid, integer)
  from public, anon;
grant execute on function public.platform_set_commission(uuid, integer)
  to authenticated;
