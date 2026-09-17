-- ============================================================================
-- Dlay Agenda · Pagar la cuenta, y que avise cuando toca
--
-- Dos piezas que van juntas: el aviso de que cerró el mes, y el enlace de
-- Mercado Pago para saldarlo sin salir del sistema.
--
-- El enlace se guarda en lugar de generarse cada vez. Mercado Pago crea una
-- preferencia nueva por cada llamada, así que un botón que la pide de nuevo en
-- cada visita deja la cuenta de Dlay llena de cobros fantasma que nadie va a
-- poder conciliar. Uno por mes y negocio, y listo.
--
-- El aviso no se manda el día 1 y se olvida: se busca todos los días durante
-- la primera semana y se marca con una etiqueta. Así, si el reloj no corrió
-- justo ese día —o el negocio activó las notificaciones el día 3—, el aviso
-- igual sale, y nunca sale dos veces.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El enlace de pago de cada mes
-- ---------------------------------------------------------------------------
create table public.billing_links (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  period        date not null,

  -- Lo que devuelve Mercado Pago. El identificador sirve para reconciliar
  -- después; la dirección es la que abre el cliente.
  preference_id text not null,
  url           text not null,

  created_at    timestamptz not null default now(),

  constraint billing_links_pkey primary key (tenant_id, period),
  constraint billing_links_period_is_month
    check (period = date_trunc('month', period)::date),
  -- Que sea de Mercado Pago y no cualquier cosa. Es lo que permite que la
  -- dirección la escriba el propio negocio sin que se pueda plantar otra.
  constraint billing_links_url_es_mp
    check (url like 'https://www.mercadopago.com%'
        or url like 'https://www.mercadopago.com.ar%')
);

comment on table public.billing_links is
  'El cobro de Mercado Pago de un mes. Se guarda para no crear una preferencia '
  'nueva cada vez que alguien abre la pantalla.';

alter table public.billing_links enable row level security;
alter table public.billing_links force row level security;

create policy "billing_links: ver los propios"
  on public.billing_links for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.billing_links from anon, authenticated;
grant select on public.billing_links to authenticated;

-- Escribir pasa por acá. La tabla no tiene INSERT para nadie.
create or replace function public.billing_link_save(
  p_period        date,
  p_preference_id text,
  p_url           text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_tz     text;
  v_mes    date;
begin
  select t.id, t.timezone into v_tenant, v_tz
  from public.tenants t
  where (select app.has_role(t.id, 'owner', 'admin'))
  limit 1;

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos tu negocio.');
  end if;

  p_period := date_trunc('month', p_period)::date;
  v_mes    := date_trunc('month', (now() at time zone v_tz))::date;

  -- No se cobra un mes que todavía no terminó.
  if p_period >= v_mes then
    return jsonb_build_object('ok', false, 'error', 'Ese mes todavía no cerró.');
  end if;

  if exists (
    select 1 from public.billing_payments bp
    where bp.tenant_id = v_tenant and bp.period = p_period
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese mes ya figura pagado.');
  end if;

  insert into public.billing_links (tenant_id, period, preference_id, url)
  values (v_tenant, p_period, p_preference_id, p_url)
  on conflict (tenant_id, period) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.billing_link_save(date, text, text)
  from public, anon;
grant execute on function public.billing_link_save(date, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Tu cuenta, ahora con el enlace de cada mes
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
          'total_cents',  coalesce(pg.amount_cents, app.comision(bp.base_cents, v_bps)),
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
-- El aviso de que cerró el mes
-- ---------------------------------------------------------------------------
-- El nombre del mes en castellano, sin depender del idioma del servidor.
-- `to_char(..., 'TMMonth')` devuelve lo que diga `lc_time`, que en Supabase es
-- C: saldría «August».
create or replace function app.mes_en_letras(p_fecha date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array[
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ])[extract(month from p_fecha)::int];
$$;

-- `p_dias` existe para poder probar la función fuera de la primera semana del
-- mes. En producción corre siempre con el valor de fábrica.
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
  v_bps    integer;
  v_total  bigint;
  v_tag    text;
  v_nombre text;
  v_salidos integer := 0;
begin
  for r in
    select t.id, t.timezone, coalesce(bs.commission_bps, 300) as bps
    from public.tenants t
    left join public.billing_settings bs on bs.tenant_id = t.id
    where t.status = 'active'
  loop
    v_hoy    := (now() at time zone r.timezone)::date;
    v_mes    := date_trunc('month', v_hoy)::date;
    v_previo := (v_mes - interval '1 month')::date;

    -- Sólo durante la primera semana: pasado eso, el aviso ya no es noticia.
    if extract(day from v_hoy) > p_dias then
      continue;
    end if;

    v_tag := 'cuenta-' || to_char(v_previo, 'YYYY-MM');

    -- Ya se avisó por este mes.
    if exists (
      select 1 from public.team_alerts ta
      where ta.tenant_id = r.id and ta.tag = v_tag
    ) then
      continue;
    end if;

    -- Ya está pagado: no hay nada que avisar.
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

    v_bps   := r.bps;
    v_total := app.comision(coalesce(v_base, 0), v_bps);

    if v_total = 0 then
      continue;
    end if;

    -- Igual que el resto de los avisos: si nadie tiene las notificaciones
    -- activadas, no se encola. Una cola de avisos que no se pueden entregar
    -- no es una cola, es basura para limpiar después.
    if not exists (
      select 1 from public.push_subscriptions ps
      where ps.tenant_id = r.id and ps.user_id is not null
    ) then
      continue;
    end if;

    v_nombre := app.mes_en_letras(v_previo);

    insert into public.team_alerts (tenant_id, kind, title, body, url, tag)
    values (
      r.id,
      'cuenta',
      'Cerró ' || initcap(v_nombre),
      'Tu cuenta de ' || v_nombre || ': $ '
        -- El separador de miles se escribe a mano. `G` usa el del servidor,
        -- que está en inglés: saldría «35,250».
        || replace(trim(to_char(v_total / 100, 'FM999,999,999')), ',', '.')
        || ' por ' || v_cant || ' turnos. Entrá para pagarla.',
      '/configuracion/cuenta',
      v_tag
    );

    v_salidos := v_salidos + 1;
  end loop;

  return v_salidos;
end;
$$;

comment on function app.avisar_cuentas(integer) is
  'Avisa a cada negocio que cerró el mes y cuánto le toca. Se busca todos los '
  'días de la primera semana y se marca con una etiqueta, así el aviso sale '
  'aunque el reloj falle un día y nunca sale dos veces.';

-- Todos los días a las 12 UTC, que en Córdoba son las 9 de la mañana.
select cron.schedule(
  'dlay-avisar-cuentas',
  '0 12 * * *',
  $$ select app.avisar_cuentas() $$
);
