-- ============================================================================
-- Dlay Agenda · Un mes gratis, después $10.000 cada 30 días
--
-- La regla, tal como se pensó:
--
--   · Desde el día en que se crea la cuenta, 30 días gratis para usarla
--     entera. Los mensajes de WhatsApp los cobra Meta igual: no son de Dlay.
--   · Al día 30 vence el primer abono. Hay 5 días para pagarlo.
--   · Al día 35 sin pago, la cuenta se suspende. No se borra nada: si paga
--     después, vuelve tal como estaba.
--   · Cada pago cubre 30 días más.
--
-- DOS CARRILES. El cobro que ya existía es por mes calendario y vencido: se
-- cobra el mes que terminó, si hubo turnos. Este es por adelantado y por
-- aniversario: se paga para usar los 30 días que siguen. Mezclarlos en una
-- sola maquinaria haría que un mismo negocio deba un mes cerrado y un ciclo
-- adelantado por el mismo servicio. Por eso cada negocio está en uno solo:
--
--   'suscripcion' — el de fábrica para toda cuenta nueva.
--   'acuerdo'     — los negocios que ya existían, con lo que se pactó en el
--                   panel. Siguen cobrándose como hasta hoy y nunca se
--                   suspenden solos.
--
-- SUSPENDER ES CAMBIAR UN ESTADO QUE EL SISTEMA YA RESPETA. El planificador
-- de avisos, la reserva online y los enlaces de autogestión ya miran
-- `tenants.status = 'active'`. Poner 'suspended' los frena sin tocar ninguna
-- de esas funciones. Lo único que hay que hacer a mano es saltear los avisos
-- que ya estaban en la cola. Las cuentas de las personas (memberships) no se
-- tocan: la dueña sigue entrando, ve sus datos y puede pagar.
-- ============================================================================

alter table public.billing_settings
  -- De fábrica 'acuerdo': una fila creada desde el panel para un negocio que
  -- no tenía es un precio pactado a mano. Sólo el alta de una cuenta nueva la
  -- pone en 'suscripcion', con sus fechas (ver `app.cobro_de_fabrica`).
  add column plan text not null default 'acuerdo'
    check (plan in ('suscripcion', 'acuerdo')),
  add column trial_ends_at timestamptz,
  add column paid_until timestamptz,
  -- Para no reactivar una cuenta que se suspendió a mano por otro motivo.
  add column suspendida_por_pago boolean not null default false,
  -- El cobro de Mercado Pago del ciclo actual, para no generar uno nuevo en
  -- cada visita: Mercado Pago crea una preferencia por llamada y después no
  -- hay forma de conciliarlas.
  add column sus_link_cycle date,
  add column sus_link_url text,
  add column sus_link_preference text,
  add column sus_link_amount bigint;

-- Todo lo que ya existía queda como acuerdo: es el valor de fábrica de la
-- columna, así que no hace falta tocar ninguna fila.

alter table public.billing_settings
  add constraint billing_settings_suscripcion_fechas check (
    plan <> 'suscripcion' or (trial_ends_at is not null and paid_until is not null)
  );

comment on column public.billing_settings.plan is
  '''suscripcion'': 30 días gratis y después se paga por adelantado cada 30 '
  'días, con 5 de gracia antes de suspender. ''acuerdo'': se cobra el mes '
  'vencido según lo pactado en el panel, y nunca se suspende solo.';
comment on column public.billing_settings.paid_until is
  'Hasta cuándo está cubierta la cuenta. Durante la prueba es el fin de la '
  'prueba. Pasados 5 días de esta fecha sin pago, la cuenta se suspende.';

-- ---------------------------------------------------------------------------
-- Toda cuenta nueva nace en la prueba
-- ---------------------------------------------------------------------------
create or replace function app.cobro_de_fabrica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_settings (tenant_id, plan, trial_ends_at, paid_until)
  values (new.id, 'suscripcion', now() + interval '30 days', now() + interval '30 days')
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- El cobro vencido no alcanza a las cuentas en suscripción
-- ---------------------------------------------------------------------------
-- Es la misma función de siempre con una condición más. Sin ella, una cuenta
-- en suscripción debería además los meses calendario con turnos: el mismo
-- servicio cobrado dos veces.
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
    -- La suscripción se cobra por su propio carril.
    and not exists (
      select 1 from public.billing_settings bs
      where bs.tenant_id = p_tenant and bs.plan = 'suscripcion'
    )
  group by 1;
$$;

-- ---------------------------------------------------------------------------
-- Los pagos de la suscripción
-- ---------------------------------------------------------------------------
create table public.subscription_payments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  -- Lo que entró de verdad, y lo que se esperaba. Van separados: un cobro
  -- viejo pagado después de un cambio de precio tiene que quedar registrado
  -- por lo que se pagó, con la diferencia a la vista.
  paid_cents     bigint not null check (paid_cents >= 0),
  expected_cents bigint not null check (expected_cents >= 0),
  covers_from    timestamptz not null,
  covers_until   timestamptz not null,
  source         text not null check (source in ('manual', 'mercadopago')),
  payment_id     text,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint subscription_payments_rango check (covers_until > covers_from)
);

-- Mercado Pago reintenta los avisos: el mismo pago no puede extender dos veces.
create unique index subscription_payments_payment_key
  on public.subscription_payments (payment_id) where payment_id is not null;
create index subscription_payments_tenant_idx
  on public.subscription_payments (tenant_id, created_at desc);

alter table public.subscription_payments enable row level security;
alter table public.subscription_payments force row level security;

create policy "subscription_payments: ver los propios"
  on public.subscription_payments for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.subscription_payments from anon, authenticated;
grant select on public.subscription_payments to authenticated;

-- ---------------------------------------------------------------------------
-- Dónde está parada una cuenta
-- ---------------------------------------------------------------------------
create or replace function app.estado_suscripcion(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when bs.tenant_id is null or bs.plan <> 'suscripcion' then
      jsonb_build_object('plan', 'acuerdo', 'estado', 'acuerdo')
    else jsonb_build_object(
      'plan', 'suscripcion',
      'estado', case
        when now() < bs.trial_ends_at                      then 'prueba'
        when now() < bs.paid_until                         then 'activa'
        when now() < bs.paid_until + interval '5 days'     then 'a_pagar'
        else 'suspendida'
      end,
      'prueba_hasta', bs.trial_ends_at,
      'pagado_hasta', bs.paid_until,
      'gracia_hasta', bs.paid_until + interval '5 days',
      'abono_cents',  bs.fixed_cents,
      -- El cobro de Mercado Pago sólo sirve para este ciclo y este importe.
      'link', case
        when bs.sus_link_cycle = (bs.paid_until)::date
         and bs.sus_link_amount = bs.fixed_cents
        then bs.sus_link_url
      end
    )
  end
  from (select p_tenant as id) x
  left join public.billing_settings bs on bs.tenant_id = x.id;
$$;

revoke all on function app.estado_suscripcion(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Suspender y reactivar
-- ---------------------------------------------------------------------------
create or replace function app.aplicar_suspension(p_tenant uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan    text;
  v_hasta   timestamptz;
  v_por_pago boolean;
  v_status  text;
begin
  select bs.plan, bs.paid_until, bs.suspendida_por_pago, t.status
    into v_plan, v_hasta, v_por_pago, v_status
  from public.billing_settings bs
  join public.tenants t on t.id = bs.tenant_id
  where bs.tenant_id = p_tenant;

  if v_plan is distinct from 'suscripcion' then
    return 'sin_cambios';
  end if;

  if now() >= v_hasta + interval '5 days' then
    if v_status = 'active' then
      update public.tenants set status = 'suspended' where id = p_tenant;
      update public.billing_settings set suspendida_por_pago = true
       where tenant_id = p_tenant;
      -- Lo que ya estaba en la cola. Lo que no se planificó todavía no se
      -- va a planificar: el planificador sólo mira negocios activos.
      update public.message_jobs
         set status = 'skipped',
             skip_reason = 'La cuenta está suspendida por falta de pago.'
       where tenant_id = p_tenant and status = 'pending';
      return 'suspendida';
    end if;
  elsif v_status = 'suspended' and v_por_pago then
    -- Sólo se reactiva lo que se suspendió por pago: una cuenta suspendida a
    -- mano por otro motivo no vuelve sola porque alguien pagó.
    update public.tenants set status = 'active' where id = p_tenant;
    update public.billing_settings set suspendida_por_pago = false
     where tenant_id = p_tenant;
    return 'reactivada';
  end if;

  return 'sin_cambios';
end;
$$;

revoke all on function app.aplicar_suspension(uuid) from public, anon, authenticated;

create or replace function app.aplicar_suspensiones()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_n      integer := 0;
begin
  for v_tenant in
    select tenant_id from public.billing_settings where plan = 'suscripcion'
  loop
    if app.aplicar_suspension(v_tenant) <> 'sin_cambios' then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function app.aplicar_suspensiones() from public, anon, authenticated;

-- Cada hora. Un negocio que vence a la mañana no tiene por qué esperar al
-- mediodía del día siguiente para quedar suspendido, ni uno que pagó para
-- volver.
select cron.schedule(
  'dlay-suspensiones',
  '17 * * * *',
  $$select app.aplicar_suspensiones()$$
);

-- ---------------------------------------------------------------------------
-- Registrar un pago
-- ---------------------------------------------------------------------------
create or replace function app.registrar_pago_suscripcion(
  p_tenant     uuid,
  p_paid_cents bigint,
  p_source     text,
  p_payment_id text default null,
  p_note       text default null,
  p_por        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  text;
  v_hasta timestamptz;
  v_abono bigint;
  v_desde timestamptz;
  v_nuevo timestamptz;
begin
  select plan, paid_until, fixed_cents into v_plan, v_hasta, v_abono
  from public.billing_settings
  where tenant_id = p_tenant
  for update;

  if v_plan is distinct from 'suscripcion' then
    return jsonb_build_object('ok', false,
      'error', 'Este negocio no está en el abono mensual.');
  end if;

  if p_paid_cents is null or p_paid_cents < 0 then
    return jsonb_build_object('ok', false, 'error', 'El importe no es válido.');
  end if;

  if p_payment_id is not null and exists (
    select 1 from public.subscription_payments where payment_id = p_payment_id
  ) then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  -- Si todavía no se suspendió, el ciclo nuevo arranca donde terminaba el
  -- pagado: pagar dos días tarde no regala dos días. Si ya estaba suspendida,
  -- arranca hoy: no se cobran los días en que no tuvo servicio.
  v_desde := case
    when now() < v_hasta + interval '5 days' then v_hasta
    else now()
  end;
  v_nuevo := v_desde + interval '30 days';

  insert into public.subscription_payments
    (tenant_id, paid_cents, expected_cents, covers_from, covers_until,
     source, payment_id, note, created_by)
  values
    (p_tenant, p_paid_cents, v_abono, v_desde, v_nuevo,
     p_source, nullif(btrim(p_payment_id), ''), nullif(btrim(p_note), ''), p_por);

  update public.billing_settings
     set paid_until = v_nuevo,
         updated_at = now()
   where tenant_id = p_tenant;

  -- Si estaba suspendida por falta de pago, vuelve ahora y no en la próxima
  -- vuelta del reloj.
  perform app.aplicar_suspension(p_tenant);

  return jsonb_build_object(
    'ok', true,
    'cubre_desde', v_desde,
    'cubre_hasta', v_nuevo,
    'diferencia_cents', p_paid_cents - v_abono
  );
end;
$$;

revoke all on function app.registrar_pago_suscripcion(uuid, bigint, text, text, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Para la pantalla del negocio
-- ---------------------------------------------------------------------------
create or replace function public.suscripcion_estado(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Cualquiera del equipo ve el estado —lo necesita para saber si la cuenta
  -- funciona—; los pagos, sólo quien administra.
  if not app.has_tenant(p_tenant) then
    return null;
  end if;

  return app.estado_suscripcion(p_tenant) || jsonb_build_object(
    'pagos', case when app.has_role(p_tenant, 'owner', 'admin') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'fecha', sp.created_at,
               'pagado_cents', sp.paid_cents,
               'cubre_hasta', sp.covers_until,
               'origen', sp.source
             ) order by sp.created_at desc), '[]'::jsonb)
      from (select * from public.subscription_payments
             where tenant_id = p_tenant
             order by created_at desc limit 12) sp
    ) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.suscripcion_estado(uuid) from public, anon;
grant execute on function public.suscripcion_estado(uuid) to authenticated;

-- Guarda el cobro de Mercado Pago del ciclo, para reusarlo.
create or replace function public.suscripcion_link_save(
  p_tenant        uuid,
  p_cycle         date,
  p_preference_id text,
  p_url           text,
  p_amount_cents  bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_role(p_tenant, 'owner', 'admin') then
    return jsonb_build_object('ok', false,
      'error', 'Sólo titulares y administración pueden pagar la cuenta.');
  end if;

  update public.billing_settings
     set sus_link_cycle = p_cycle,
         sus_link_preference = p_preference_id,
         sus_link_url = p_url,
         sus_link_amount = p_amount_cents
   where tenant_id = p_tenant and plan = 'suscripcion';

  if not found then
    return jsonb_build_object('ok', false,
      'error', 'Este negocio no está en el abono mensual.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.suscripcion_link_save(uuid, date, text, text, bigint)
  from public, anon;
grant execute on function public.suscripcion_link_save(uuid, date, text, text, bigint)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Mercado Pago avisa que entró un pago de suscripción
-- ---------------------------------------------------------------------------
-- La referencia es "sus:<negocio>:<ciclo>". El webhook manda acá las que
-- empiezan con "sus:" y deja las demás donde iban siempre.
create or replace function public.rpc_mercadopago_suscripcion(
  p_external_reference text,
  p_payment_id         text,
  p_paid_cents         bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(coalesce(p_external_reference, ''), ':');
  v_tenant uuid;
begin
  if array_length(v_partes, 1) <> 3 or v_partes[1] <> 'sus' then
    return jsonb_build_object('ok', false, 'error', 'Referencia desconocida.');
  end if;

  begin
    v_tenant := v_partes[2]::uuid;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Referencia mal formada.');
  end;

  return app.registrar_pago_suscripcion(
    v_tenant, p_paid_cents, 'mercadopago', p_payment_id,
    'Mercado Pago, ciclo ' || v_partes[3], null
  );
end;
$$;

revoke all on function public.rpc_mercadopago_suscripcion(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.rpc_mercadopago_suscripcion(text, text, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- Para el panel de Dlay
-- ---------------------------------------------------------------------------
create or replace function public.platform_suscripciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(
      app.estado_suscripcion(t.id) || jsonb_build_object(
        'tenant_id', t.id,
        'nombre', t.name,
        'creado', t.created_at,
        'ultimo_pago', (
          select jsonb_build_object('fecha', sp.created_at,
                                    'pagado_cents', sp.paid_cents)
          from public.subscription_payments sp
          where sp.tenant_id = t.id
          order by sp.created_at desc limit 1
        )
      ) order by bs.paid_until
    )
    from public.tenants t
    join public.billing_settings bs on bs.tenant_id = t.id
    where bs.plan = 'suscripcion'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.platform_suscripciones() from public, anon;
grant execute on function public.platform_suscripciones() to authenticated;

-- Un pago cargado a mano: transferencia, efectivo, o un mes regalado (cero).
create or replace function public.platform_pago_suscripcion(
  p_tenant      uuid,
  p_monto_cents bigint,
  p_nota        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'No autorizado.');
  end if;

  return app.registrar_pago_suscripcion(
    p_tenant, p_monto_cents, 'manual', null, p_nota, (select auth.uid())
  );
end;
$$;

revoke all on function public.platform_pago_suscripcion(uuid, bigint, text)
  from public, anon;
grant execute on function public.platform_pago_suscripcion(uuid, bigint, text)
  to authenticated;
