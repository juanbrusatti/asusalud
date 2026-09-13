-- ============================================================================
-- Dlay Estética · Avisos al equipo y notificaciones para la clienta
--
-- Las notificaciones push ya funcionaban como canal de recordatorios, pero
-- nadie las disparaba cuando pasa algo ni había forma de que una clienta las
-- aceptara. Faltaban las dos puntas.
--
--   · AL EQUIPO. Una reserva que entra a las once de la noche y una
--     cancelación de la clienta son las dos cosas que hoy se descubren al día
--     siguiente, mirando la agenda. Avisar en el momento es lo que convierte
--     una cancelación en un horario que todavía se puede volver a vender.
--
--   · A LA CLIENTA. Es el único canal gratis del sistema. Cada clienta que
--     acepta es una que deja de costar $37,68 por recordatorio, para siempre.
--
-- Dos decisiones que definen el módulo:
--
--   1. SÓLO AVISA LO QUE NO HIZO EL EQUIPO. Si la recepcionista carga un turno
--      o cancela uno, nadie recibe nada: ya lo sabe, lo acaba de hacer. Avisar
--      de los propios actos es la forma más rápida de que alguien apague las
--      notificaciones.
--
--   2. LA LLAVE DE LA CLIENTA ES EL ENLACE DE SU TURNO. Si `anon` pudiera
--      suscribirse pasando un id de clienta cualquiera, cualquiera podría
--      recibir los recordatorios de otra persona. El token del turno ya
--      identifica a quien lo tiene, y no hace falta inventar otra cosa.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La cola de avisos
-- ---------------------------------------------------------------------------
create table public.team_alerts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,

  -- Qué pasó. Texto y no enum: los avisos nuevos no tienen por qué costar una
  -- migración de tipo.
  kind           text not null,
  title          text not null,
  body           text not null,
  -- Adónde lleva al tocarla.
  url            text,
  -- Con la misma etiqueta, un aviso nuevo del mismo turno reemplaza al
  -- anterior en lugar de apilarse.
  tag            text,
  appointment_id uuid references public.appointments (id) on delete set null,

  attempts       integer not null default 0,
  sent_at        timestamptz,
  failed_at      timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),

  constraint team_alerts_kind_len  check (char_length(kind) between 2 and 40),
  constraint team_alerts_title_len check (char_length(title) between 2 and 80),
  constraint team_alerts_body_len  check (char_length(body) between 2 and 300)
);

-- La cola se lee siempre igual: lo pendiente, lo más viejo primero.
create index team_alerts_pendientes_idx
  on public.team_alerts (created_at)
  where sent_at is null and failed_at is null;
create index team_alerts_tenant_idx
  on public.team_alerts (tenant_id, created_at desc);

comment on table public.team_alerts is
  'Cola de avisos al equipo. Es una bitácora además de una cola: queda qué se '
  'avisó y cuándo, que es lo que permite discutir si el aviso llegó o no.';

alter table public.team_alerts enable row level security;
alter table public.team_alerts force row level security;

-- Se pueden mirar, no escribir: los crea el trigger y los cierra el emisor.
create policy "team_alerts: ver los de mi estética"
  on public.team_alerts for select to authenticated
  using ((select app.has_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- 2. Encolar un aviso
-- ---------------------------------------------------------------------------
create or replace function app.notify_team(
  p_tenant      uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_url         text default null,
  p_appointment uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Si nadie del equipo tiene las notificaciones activadas, no se encola: una
  -- cola llena de avisos que nunca van a poder entregarse no es una cola, es
  -- basura que hay que limpiar después.
  if not exists (
    select 1 from public.push_subscriptions ps
    where ps.tenant_id = p_tenant and ps.user_id is not null
  ) then
    return;
  end if;

  insert into public.team_alerts
    (tenant_id, kind, title, body, url, tag, appointment_id)
  values
    (p_tenant, p_kind, left(p_title, 80), left(p_body, 300), p_url,
     p_appointment::text, p_appointment);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Qué merece un aviso
-- ---------------------------------------------------------------------------
create or replace function app.alert_on_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clienta  boolean := coalesce(
    current_setting('app.by_client', true) = 'on', false
  );
  v_tz       text;
  v_nombre   text;
  v_servicio text;
  v_cuando   text;
  v_antes    text;
begin
  select t.timezone into v_tz
  from public.tenants t where t.id = new.tenant_id;

  select trim(c.first_name || ' ' || coalesce(c.last_name, ''))
    into v_nombre
  from public.clients c where c.id = new.client_id;
  v_nombre := coalesce(nullif(v_nombre, ''), 'Alguien');

  -- En castellano y en la zona de la estética: un aviso que dice la hora en
  -- UTC no sirve para nada.
  v_cuando := trim(to_char(new.starts_at at time zone v_tz, 'DD/MM'))
              || ' a las '
              || trim(to_char(new.starts_at at time zone v_tz, 'HH24:MI'));

  if tg_op = 'INSERT' then
    -- Sólo lo que entra sin que nadie lo cargue. Un turno que puso el equipo
    -- no necesita anunciarse a quien lo acaba de poner.
    if new.source <> 'online' then
      return null;
    end if;

    select string_agg(s.name, ' + ' order by aps.position)
      into v_servicio
    from public.appointment_services aps
    join public.services s on s.id = aps.service_id
    where aps.appointment_id = new.id;

    perform app.notify_team(
      new.tenant_id, 'booking', 'Reserva nueva',
      format('%s · %s%s', v_nombre, v_cuando,
             case when v_servicio is null then '' else ' · ' || v_servicio end),
      '/agenda/' || new.id, new.id
    );
    return null;
  end if;

  -- De acá para abajo, sólo cambios hechos por la clienta desde su enlace.
  if not v_clienta then
    return null;
  end if;

  if new.status = 'cancelled' and old.status is distinct from new.status then
    perform app.notify_team(
      new.tenant_id, 'cancel', 'Cancelaron un turno',
      format('%s no viene el %s. El horario quedó libre.', v_nombre, v_cuando),
      '/agenda/' || new.id, new.id
    );
    return null;
  end if;

  if old.starts_at is distinct from new.starts_at then
    v_antes := trim(to_char(old.starts_at at time zone v_tz, 'DD/MM'))
               || ' a las '
               || trim(to_char(old.starts_at at time zone v_tz, 'HH24:MI'));

    perform app.notify_team(
      new.tenant_id, 'reschedule', 'Movieron un turno',
      format('%s pasó del %s al %s.', v_nombre, v_antes, v_cuando),
      '/agenda/' || new.id, new.id
    );
  end if;

  return null;
end;
$$;

-- Después de que el turno ya está escrito: el aviso nunca puede hacer fallar
-- la reserva ni la cancelación que lo provocó.
create trigger appointments_alert_team
  after insert or update of status, starts_at on public.appointments
  for each row execute function app.alert_on_appointment();

-- ---------------------------------------------------------------------------
-- 4. Lo que usa el emisor
-- ---------------------------------------------------------------------------
create or replace function public.rpc_claim_team_alerts(p_limit integer default 20)
returns setof public.team_alerts
language sql
security definer
set search_path = ''
as $$
  update public.team_alerts a
  set attempts = a.attempts + 1
  where a.id in (
    select id from public.team_alerts
    where sent_at is null
      and failed_at is null
      and attempts < 3
    order by created_at
    for update skip locked
    limit p_limit
  )
  returning a.*;
$$;

create or replace function public.rpc_finish_team_alert(
  p_id    uuid,
  p_ok    boolean,
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.team_alerts
  set sent_at    = case when p_ok then now() end,
      -- A los tres intentos se deja de probar: si el aviso llegara ahora ya
      -- no serviría para nada.
      failed_at  = case when not p_ok and attempts >= 3 then now() end,
      last_error = case when p_ok then null else left(p_error, 300) end
  where id = p_id;
$$;

/**
 * Las suscripciones del equipo de una estética.
 *
 * Son las que tienen `user_id`: las de las clientas cuelgan de `client_id` y
 * no tienen por qué enterarse de lo que pasa en la agenda.
 */
create or replace function public.rpc_team_push_targets(p_tenant uuid)
returns table (endpoint text, p256dh text, auth text)
language sql
security definer
set search_path = ''
as $$
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  where ps.tenant_id = p_tenant and ps.user_id is not null;
$$;

revoke all on function public.rpc_claim_team_alerts(integer) from public, anon, authenticated;
revoke all on function public.rpc_finish_team_alert(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.rpc_team_push_targets(uuid) from public, anon, authenticated;

grant execute on function public.rpc_claim_team_alerts(integer) to service_role;
grant execute on function public.rpc_finish_team_alert(uuid, boolean, text) to service_role;
grant execute on function public.rpc_team_push_targets(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Que el aviso salga ya
-- ---------------------------------------------------------------------------
-- El reloj corre cada minuto, que para un recordatorio está bien pero para
-- "acaba de entrar una reserva" no: se despierta al emisor en el momento. La
-- llamada de pg_net sale recién cuando la transacción confirma, así que no
-- puede demorar ni romper la reserva.
create or replace function app.wake_dispatch_on_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.trigger_dispatch();
  return null;
end;
$$;

create trigger team_alerts_wake_dispatch
  after insert on public.team_alerts
  for each row execute function app.wake_dispatch_on_alert();

-- ---------------------------------------------------------------------------
-- 6. La clienta acepta las notificaciones
-- ---------------------------------------------------------------------------
-- `register_push_subscription` acepta un `client_id` pero sólo está concedida
-- a usuarios autenticados, y con razón: si `anon` pudiera pasar el id que
-- quisiera, cualquiera podría suscribir su navegador a los recordatorios de
-- otra persona. Acá la llave es el token del turno, que ya identifica a quien
-- lo tiene.
create or replace function public.booking_subscribe_push(
  p_token      text,
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_client uuid;
begin
  select a.tenant_id, a.client_id into v_tenant, v_client
  from public.appointments a
  where a.manage_token = p_token
    and length(coalesce(p_token, '')) >= 16;

  if v_client is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos este turno.');
  end if;

  if coalesce(trim(p_endpoint), '') = ''
     or coalesce(trim(p_p256dh), '') = ''
     or coalesce(trim(p_auth), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Faltan datos de la suscripción.');
  end if;

  -- El navegador puede devolver la misma suscripción al volver a pedirla, así
  -- que registrar dos veces no puede fallar.
  insert into public.push_subscriptions
    (tenant_id, client_id, endpoint, p256dh, auth, user_agent)
  values
    (v_tenant, v_client, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        client_id  = excluded.client_id,
        failures   = 0;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.booking_subscribe_push(text, text, text, text, text)
  from public;
grant execute on function public.booking_subscribe_push(text, text, text, text, text)
  to anon, authenticated;
