-- ============================================================================
-- Dlay Estética · Notificaciones push
--
-- El único canal verdaderamente gratis e ilimitado de los tres. Cada
-- recordatorio que sale por acá en lugar de WhatsApp son $37,68 que la
-- estética no gasta.
--
-- Sirve para dos públicos distintos y conviene no confundirlos:
--
--   · EL EQUIPO. Instala la aplicación en el teléfono y recibe avisos de lo
--     que pasa: una reserva nueva, una cancelación. Es adopción alta porque
--     usan el sistema todos los días.
--   · LAS CLIENTAS. Sólo las que acepten notificaciones al reservar online.
--     La adopción va a ser baja, pero cada una que acepte es una que deja de
--     costar plata para siempre.
-- ============================================================================

alter table public.push_subscriptions
  add column user_agent   text,
  add column last_used_at timestamptz,
  add column failures     integer not null default 0;

comment on column public.push_subscriptions.failures is
  'Envíos rechazados seguidos. Un navegador que se desinstaló devuelve 410 y '
  'la suscripción se borra sola: guardar suscripciones muertas ensucia las '
  'métricas y hace más lento cada envío.';

-- Una persona puede tener el sistema instalado en el teléfono y en la
-- computadora: son dos suscripciones distintas del mismo usuario.
create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- Registrar y borrar
-- ---------------------------------------------------------------------------
-- El navegador puede devolver la misma suscripción al volver a pedirla, así
-- que registrar dos veces no tiene que fallar.
create or replace function public.register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null,
  p_client_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant uuid;
  v_id     uuid;
begin
  if p_client_id is not null then
    -- Suscripción de una clienta: la estética sale de su ficha.
    select tenant_id into v_tenant from public.clients where id = p_client_id;
  else
    if v_uid is null then
      raise exception 'Hace falta estar autenticado.' using errcode = '42501';
    end if;
    select tenant_id into v_tenant
    from public.memberships
    where user_id = v_uid and status = 'active'
    limit 1;
  end if;

  if v_tenant is null then
    raise exception 'No encontramos la estética.' using errcode = '42501';
  end if;

  insert into public.push_subscriptions
    (tenant_id, user_id, client_id, endpoint, p256dh, auth, user_agent)
  values
    (v_tenant, case when p_client_id is null then v_uid end, p_client_id,
     p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        failures = 0
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint
    and (
      user_id = (select auth.uid())
      or (select app.has_tenant(tenant_id))
    );
$$;

revoke all on function public.register_push_subscription(text, text, text, text, uuid)
  from public;
revoke all on function public.unregister_push_subscription(text) from public;
grant execute on function public.register_push_subscription(text, text, text, text, uuid)
  to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que el emisor necesita
-- ---------------------------------------------------------------------------
-- Se agrega la suscripción al payload del envío. Una persona puede tener
-- varias (teléfono y computadora): el emisor le manda a todas.
drop function if exists public.rpc_push_targets(uuid);

create or replace function public.rpc_push_targets(p_client uuid)
returns table (endpoint text, p256dh text, auth text)
language sql
security definer
set search_path = ''
as $$
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  where ps.client_id = p_client;
$$;

-- Una suscripción que el navegador ya no reconoce se borra sola.
create or replace function public.rpc_drop_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.rpc_push_targets(uuid) from public, anon, authenticated;
revoke all on function public.rpc_drop_push_subscription(text) from public, anon, authenticated;
grant execute on function public.rpc_push_targets(uuid) to service_role;
grant execute on function public.rpc_drop_push_subscription(text) to service_role;
