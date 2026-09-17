-- ============================================================================
-- Dlay Agenda · Que el pago se marque solo
--
-- Hasta acá, cuando un negocio pagaba, alguien de Dlay tenía que entrar al
-- panel y marcarlo a mano. Con un cliente son treinta segundos; con veinte es
-- un trabajo, y un trabajo que se olvida.
--
-- Mercado Pago avisa por webhook cuando un pago cambia de estado. Lo que llega
-- es apenas un identificador, así que el aviso no se cree: se le pregunta a
-- Mercado Pago por ese pago con NUESTRA clave, y se cree lo que conteste.
--
-- Eso es lo que hace que no haga falta verificar la firma para estar seguros.
-- Alguien que invente un aviso sólo consigue que le preguntemos a Mercado Pago
-- por un pago que no existe, o que no es nuestro —con nuestra clave sólo vemos
-- los nuestros—. Para que marquemos un mes como pagado tiene que haber, de
-- verdad, un pago aprobado en nuestra cuenta con ese negocio y ese mes. Y eso
-- se consigue de una sola forma: pagando.
-- ============================================================================

-- De dónde vino el pago. Sirve para rastrear uno puntual en Mercado Pago, y
-- para distinguir de un vistazo lo que se cobró solo de lo que se marcó a mano.
alter table public.billing_payments
  add column payment_id text,
  add column source text not null default 'manual'
    check (source in ('manual', 'mercadopago'));

comment on column public.billing_payments.payment_id is
  'El identificador del pago en Mercado Pago, cuando entró por ahí.';

create unique index billing_payments_payment_id_key
  on public.billing_payments (payment_id)
  where payment_id is not null;

-- ---------------------------------------------------------------------------
-- Marcar un mes pagado, en un solo lugar
-- ---------------------------------------------------------------------------
-- Lo llaman dos caminos —el panel y el webhook— y por eso vive acá. Si cada
-- uno tuviera su copia, la del webhook y la del panel terminarían congelando
-- cosas distintas, y nadie se enteraría hasta que un negocio reclame.
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

  select coalesce(bs.commission_bps, 300) into v_bps
  from public.tenants t
  left join public.billing_settings bs on bs.tenant_id = t.id
  where t.id = p_tenant;

  v_total := app.comision(v_base, v_bps);

  insert into public.billing_payments
    (tenant_id, period, appointments, base_cents, commission_bps,
     amount_cents, note, payment_id, source, created_by)
  values
    (p_tenant, p_period, v_cant, coalesce(v_base, 0), v_bps, v_total,
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

-- El panel ahora sólo comprueba quién pregunta y delega.
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
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  return app.marcar_pagado(
    p_tenant, p_period, p_note, null, 'manual', (select auth.uid())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- La puerta del webhook
-- ---------------------------------------------------------------------------
-- La referencia externa viaja en el cobro que creamos nosotros y vuelve tal
-- cual. Tiene la forma `<negocio>:<AAAA-MM-01>`.
create or replace function public.rpc_mercadopago_paid(
  p_external_reference text,
  p_payment_id         text
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

  -- Mercado Pago reintenta el mismo aviso. Si ya lo procesamos, se contesta
  -- que sí y no se toca nada: reintentar tiene que ser gratis.
  if exists (
    select 1 from public.billing_payments bp
    where bp.payment_id = p_payment_id
  ) then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  return app.marcar_pagado(
    v_tenant, v_period,
    'Pagado por Mercado Pago.', p_payment_id, 'mercadopago', null
  );
end;
$$;

revoke all on function public.rpc_mercadopago_paid(text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_mercadopago_paid(text, text) to service_role;

comment on function public.rpc_mercadopago_paid(text, text) is
  'Marca un mes como pagado a partir de un pago aprobado de Mercado Pago. '
  'Sólo la llama el webhook, que antes le preguntó a Mercado Pago por ese '
  'pago con nuestra propia clave.';
