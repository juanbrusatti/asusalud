-- ============================================================================
-- Dlay Agenda · Que el cobro diga lo que hay que pagar
--
-- El enlace de Mercado Pago se guardaba una sola vez por mes para no llenar la
-- cuenta de cobros duplicados. Lo que no se contempló es que el importe puede
-- cambiar después: se cambia la forma de cobro, o se pone un importe a mano, y
-- el enlace guardado sigue diciendo lo de antes. La pantalla mostraba $40.000
-- y el QR cobraba $240.
--
-- Dos arreglos, y el segundo es el que importa de verdad:
--
-- · **El enlace guarda su importe.** Se reusa sólo mientras coincida con lo
--   que hay que cobrar hoy; si cambió, se pide uno nuevo. La comprobación se
--   hace al usarlo, que es el único momento que importa: intentar borrar el
--   enlace cada vez que algo cambia el importe es repartir la misma regla por
--   cinco lugares y olvidarse de uno.
--
-- · **Se registra lo que entró, no lo que se esperaba.** El cobro viejo sigue
--   vivo en Mercado Pago y alguien lo puede pagar. Si eso pasa, el mes tiene
--   que quedar cobrado por lo que realmente se pagó, y con la diferencia
--   anotada. Dar por cobrado un importe que nadie pagó es peor que no
--   cobrarlo: no queda rastro de que falta plata.
-- ============================================================================

alter table public.billing_links
  add column amount_cents bigint not null default 0 check (amount_cents >= 0);

comment on column public.billing_links.amount_cents is
  'Por cuánto se generó este cobro. Si hoy hay que cobrar otra cosa, el enlace '
  'no sirve y se pide uno nuevo.';

-- Los que ya existen no saben por cuánto se hicieron, así que no se reusan.
update public.billing_links set amount_cents = 0;

create or replace function public.billing_link_save(
  p_period        date,
  p_preference_id text,
  p_url           text,
  p_amount_cents  bigint default 0
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

  if p_period >= v_mes then
    return jsonb_build_object('ok', false, 'error', 'Ese mes todavía no cerró.');
  end if;

  if exists (
    select 1 from public.billing_payments bp
    where bp.tenant_id = v_tenant and bp.period = p_period
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ese mes ya figura pagado.');
  end if;

  -- Reemplaza al anterior: si se llegó hasta acá es porque el que había no
  -- servía, y dejar los dos sería no saber cuál es el bueno.
  insert into public.billing_links
    (tenant_id, period, preference_id, url, amount_cents, created_at)
  values (v_tenant, p_period, p_preference_id, p_url,
          coalesce(p_amount_cents, 0), now())
  on conflict (tenant_id, period) do update
    set preference_id = excluded.preference_id,
        url           = excluded.url,
        amount_cents  = excluded.amount_cents,
        created_at    = now();

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.billing_link_save(date, text, text);

revoke all on function public.billing_link_save(date, text, text, bigint)
  from public, anon;
grant execute on function public.billing_link_save(date, text, text, bigint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Tu cuenta: el enlace sólo si todavía sirve
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
          -- Sólo si fue hecho por el importe que hay que pagar hoy. Si no,
          -- vale nulo y la pantalla pide uno nuevo.
          'link', case
                    when bl.amount_cents
                       = app.importe_mes(v_tenant, bp.period, bp.base_cents)
                    then bl.url
                  end
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
-- Cobrar: lo que entró, cuando se sabe
-- ---------------------------------------------------------------------------
-- El parámetro nuevo tiene valor por omisión, así que `create or replace` no
-- reemplaza: crea una segunda versión y Postgres deja de saber cuál llamar.
drop function if exists app.marcar_pagado(uuid, date, text, text, text, uuid);

create or replace function app.marcar_pagado(
  p_tenant     uuid,
  p_period     date,
  p_note       text default null,
  p_payment_id text default null,
  p_source     text default 'manual',
  p_por        uuid default null,
  -- Lo que realmente entró. Nulo cuando se marca a mano: ahí se cobra lo que
  -- corresponde según lo pactado.
  p_paid_cents bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz        text;
  v_mes       date;
  v_cant      integer;
  v_base      bigint;
  v_bps       integer;
  v_modo      text;
  v_esperado  bigint;
  v_total     bigint;
  v_nota      text;
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

  v_esperado := app.importe_mes(p_tenant, p_period, coalesce(v_base, 0));
  v_total    := coalesce(p_paid_cents, v_esperado);
  v_nota     := nullif(btrim(p_note), '');

  -- Si entró algo distinto de lo que correspondía, queda anotado. Un cobro
  -- que no cierra tiene que poder verse; taparlo es perder plata en silencio.
  if p_paid_cents is not null and p_paid_cents <> v_esperado then
    v_nota := trim(
      coalesce(v_nota || ' ', '')
      || 'Correspondían $ ' || app.pesos(v_esperado)
      || ' y entraron $ ' || app.pesos(p_paid_cents) || '.'
    );
  end if;

  insert into public.billing_payments
    (tenant_id, period, appointments, base_cents, commission_bps, mode,
     amount_cents, note, payment_id, source, created_by)
  values
    (p_tenant, p_period, v_cant, coalesce(v_base, 0), v_bps, v_modo, v_total,
     v_nota, nullif(btrim(p_payment_id), ''), p_source, p_por)
  on conflict (tenant_id, period) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese mes ya figuraba pagado.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'periodo', p_period,
    'cantidad', v_cant,
    'base_cents', coalesce(v_base, 0),
    'total_cents', v_total,
    'esperado_cents', v_esperado
  );
end;
$$;

create or replace function public.rpc_mercadopago_paid(
  p_external_reference text,
  p_payment_id         text,
  p_paid_cents         bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_partes text[];
  v_tenant uuid;
  v_period date;
begin
  if p_external_reference is null then
    return jsonb_build_object('ok', false, 'error', 'El pago no trae referencia.');
  end if;

  v_partes := string_to_array(p_external_reference, ':');
  if array_length(v_partes, 1) <> 2 then
    return jsonb_build_object('ok', false, 'error', 'La referencia no es de Dlay.');
  end if;

  begin
    v_tenant := v_partes[1]::uuid;
    v_period := v_partes[2]::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'La referencia no es de Dlay.');
  end;

  if exists (
    select 1 from public.billing_payments bp
    where bp.payment_id = p_payment_id
  ) then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  return app.marcar_pagado(
    v_tenant, v_period,
    'Pagado por Mercado Pago.', p_payment_id, 'mercadopago', null,
    p_paid_cents
  );
end;
$$;

drop function if exists public.rpc_mercadopago_paid(text, text);

revoke all on function public.rpc_mercadopago_paid(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.rpc_mercadopago_paid(text, text, bigint)
  to service_role;
