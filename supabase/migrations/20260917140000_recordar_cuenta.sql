-- ============================================================================
-- Dlay Agenda · Recordarle la cuenta a un negocio, a mano
--
-- El aviso automático sale una vez, en la primera semana del mes. Si el negocio
-- no paga, no hay nada más: el mes queda ahí y alguien de Dlay tiene que
-- escribirle por fuera del sistema.
--
-- Esto es el empujón manual. Un botón por negocio en el panel, y lo que llega
-- del otro lado son dos cosas:
--
-- · **Un cartel en pantalla**, que aparece al entrar. Es la parte que
--   importa: no depende de que hayan activado las notificaciones, que es
--   justo lo que no hizo la mitad de la gente.
-- · **La notificación al teléfono**, si la tienen activada. Es el extra.
--
-- Se puede apretar más de una vez a propósito. Pero el cartel es uno por mes y
-- se cuenta cuántas veces se recordó: así, del lado de Dlay, se ve la
-- diferencia entre «no se enteró» y «no quiere pagar».
-- ============================================================================

-- Los pesos escritos como los escribe una persona. Estaba repetido en el aviso
-- automático: `to_char` con `G` usa el separador del servidor, que está en
-- inglés y devuelve «35,250».
create or replace function app.pesos(p_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(
    trim(to_char(coalesce(p_cents, 0) / 100, 'FM999,999,999')),
    ',', '.'
  );
$$;

-- ---------------------------------------------------------------------------
-- El recordatorio
-- ---------------------------------------------------------------------------
create table public.billing_nudges (
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  period       date not null,

  -- Cuántas veces se recordó y cuándo fue la última. Del lado de Dlay, es la
  -- diferencia entre «no se enteró» y «no quiere pagar».
  times        integer not null default 1 check (times > 0),
  last_at      timestamptz not null default now(),

  -- Cuando el negocio dice «ya lo vi», el cartel se baja. La deuda no se
  -- toca: eso sigue estando en «Tu cuenta».
  dismissed_at timestamptz,

  constraint billing_nudges_pkey primary key (tenant_id, period),
  constraint billing_nudges_period_is_month
    check (period = date_trunc('month', period)::date)
);

comment on table public.billing_nudges is
  'El empujón manual de Dlay para que un negocio pague un mes. Uno por mes, '
  'con la cuenta de cuántas veces se recordó.';

alter table public.billing_nudges enable row level security;
alter table public.billing_nudges force row level security;

-- El negocio ve el suyo y puede bajar el cartel. Crearlo es de la plataforma.
create policy "billing_nudges: ver el propio"
  on public.billing_nudges for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "billing_nudges: bajar el cartel"
  on public.billing_nudges for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.billing_nudges from anon, authenticated;
grant select, update on public.billing_nudges to authenticated;

-- ---------------------------------------------------------------------------
-- Recordar, desde el panel
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
  v_bps    integer;
  v_total  bigint;
  v_nombre text;
  v_tag    text;
  v_veces  integer;
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  select t.timezone, coalesce(bs.commission_bps, 300)
    into v_tz, v_bps
  from public.tenants t
  left join public.billing_settings bs on bs.tenant_id = t.id
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

  v_total := app.comision(coalesce(v_base, 0), v_bps);

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
        -- Un recordatorio nuevo vuelve a levantar el cartel.
        dismissed_at = null
  returning times into v_veces;

  v_nombre := app.mes_en_letras(p_period);
  v_tag    := 'recordatorio-cuenta-' || to_char(p_period, 'YYYY-MM');

  -- Si quedó uno sin entregar del recordatorio anterior, se reemplaza. Dos
  -- notificaciones iguales en el teléfono no dicen el doble.
  delete from public.team_alerts ta
  where ta.tenant_id = p_tenant
    and ta.tag = v_tag
    and ta.sent_at is null
    and ta.failed_at is null;

  -- La notificación es el extra: sólo se encola si hay a quién mandársela.
  -- El cartel de arriba va igual, y es el que no se puede perder.
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

revoke all on function public.platform_nudge(uuid, date) from public, anon;
grant execute on function public.platform_nudge(uuid, date) to authenticated;

comment on function public.platform_nudge(uuid, date) is
  'Levanta el cartel de «pagá la cuenta» en el sistema del negocio y, si tiene '
  'las notificaciones activadas, le manda además una al teléfono.';

-- ---------------------------------------------------------------------------
-- El cartel, del lado del negocio
-- ---------------------------------------------------------------------------
create or replace function public.billing_nudge()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_bps    integer;
  r        record;
begin
  select t.id, coalesce(bs.commission_bps, 300) into v_tenant, v_bps
  from public.tenants t
  left join public.billing_settings bs on bs.tenant_id = t.id
  limit 1;

  if v_tenant is null then
    return null;
  end if;

  -- Sin rol no hay cartel, y sin error tampoco: quien atiende no tiene por
  -- qué enterarse de la factura, y tampoco de que existe.
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
    -- Si lo pagó, el cartel no tiene sentido aunque nadie lo haya bajado.
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
    'total_cents', app.comision(r.base_cents, v_bps)
  );
end;
$$;

revoke all on function public.billing_nudge() from public, anon;
grant execute on function public.billing_nudge() to authenticated;

-- El aviso automático pasa a usar el mismo formateo de pesos.
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

    v_bps   := r.bps;
    v_total := app.comision(coalesce(v_base, 0), v_bps);

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

    insert into public.team_alerts (tenant_id, kind, title, body, url, tag)
    values (
      r.id,
      'cuenta',
      'Cerró ' || initcap(v_nombre),
      'Tu cuenta de ' || v_nombre || ': $ ' || app.pesos(v_total)
        || ' por ' || v_cant || ' turnos. Entrá para pagarla.',
      '/configuracion/cuenta',
      v_tag
    );

    v_salidos := v_salidos + 1;
  end loop;

  return v_salidos;
end;
$$;
