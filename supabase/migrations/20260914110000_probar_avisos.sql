-- ============================================================================
-- Dlay Agenda · Probar los avisos, y saber por qué no llegan
--
-- Hasta acá, la única forma de comprobar que las notificaciones funcionan era
-- conseguir que alguien sacara un turno por el link público y esperar. Si no
-- llegaba, no había manera de saber en cuál de los seis eslabones se cortó:
-- la suscripción, la cola, el reloj, el emisor, las claves o el teléfono.
--
-- Dos funciones para eso:
--
--   · `send_test_alert()` recorre la cadena entera a pedido. Es el botón
--     «probar» de la pantalla de ajustes.
--   · `rpc_avisos_diagnostico()` cuenta en qué estado quedó cada eslabón. La
--     ejecuta el equipo de Dlay contra el proyecto, sin entrar a la base ni
--     mirar datos de nadie: sólo devuelve cantidades y si falta un ajuste.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Probar
-- ---------------------------------------------------------------------------
create or replace function public.send_test_alert()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_tenant       uuid;
  v_propias      integer;
  v_del_equipo   integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Hace falta estar conectado.');
  end if;

  select m.tenant_id into v_tenant
  from public.memberships m
  where m.user_id = v_uid and m.status = 'active'
  limit 1;

  if v_tenant is null then
    return jsonb_build_object('ok', false,
      'error', 'No encontramos tu negocio.');
  end if;

  select count(*) into v_propias
  from public.push_subscriptions ps
  where ps.user_id = v_uid;

  select count(*) into v_del_equipo
  from public.push_subscriptions ps
  where ps.tenant_id = v_tenant and ps.user_id is not null;

  -- El caso más común y el más confuso: la pantalla dice «activadas» porque el
  -- navegador tiene su suscripción, pero al servidor nunca le llegó. Sin este
  -- mensaje, la prueba diría «enviada» y no llegaría nada.
  if v_propias = 0 then
    return jsonb_build_object('ok', false,
      'error', 'Este dispositivo no tiene las notificaciones activadas. '
            || 'Desactivalas y volvé a activarlas.');
  end if;

  insert into public.team_alerts (tenant_id, kind, title, body, url)
  values (
    v_tenant, 'test', 'Prueba de notificaciones',
    'Si estás leyendo esto, los avisos funcionan. Ya podés cerrar.',
    '/configuracion'
  );

  return jsonb_build_object(
    'ok', true,
    'dispositivos', v_del_equipo
  );
end;
$$;

comment on function public.send_test_alert() is
  'Encola un aviso de prueba para el equipo. Recorre la misma cadena que un '
  'aviso real: cola, reloj, emisor, claves y teléfono.';

revoke all on function public.send_test_alert() from public;
grant execute on function public.send_test_alert() to authenticated;

-- ---------------------------------------------------------------------------
-- Diagnosticar
-- ---------------------------------------------------------------------------
-- Devuelve cantidades y estados, nunca contenido: ni un nombre, ni un
-- teléfono, ni el secreto del emisor. Alcanza para saber dónde se corta la
-- cadena y no sirve para espiar a nadie.
create or replace function public.rpc_avisos_diagnostico()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ahora', now(),

    'ajustes', jsonb_build_object(
      'dispatch_url', coalesce(
        (select nullif(value, '') from public.platform_settings where key = 'dispatch_url'),
        'FALTA'),
      'dispatch_secret', coalesce(
        (select case when coalesce(value, '') <> '' then 'puesto' end
         from public.platform_settings where key = 'dispatch_secret'),
        'FALTA'),
      'site_url', coalesce(
        (select nullif(value, '') from public.platform_settings where key = 'site_url'),
        'FALTA')
    ),

    -- Las dos tareas del reloj de Postgres: planificar y despachar. Si acá
    -- falta alguna, la cola no se llena o no se vacía.
    'reloj', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', j.jobname,
               'cada',   j.schedule,
               'activo', j.active
             ) order by j.jobname)
      from cron.job j
    ), '[]'::jsonb),

    'suscripciones', jsonb_build_object(
      'equipo',   (select count(*) from public.push_subscriptions where user_id is not null),
      'clientes', (select count(*) from public.push_subscriptions where client_id is not null)
    ),

    'avisos', jsonb_build_object(
      'total',       (select count(*) from public.team_alerts),
      'pendientes',  (select count(*) from public.team_alerts where sent_at is null and failed_at is null),
      'entregados',  (select count(*) from public.team_alerts where sent_at is not null),
      'fallados',    (select count(*) from public.team_alerts where failed_at is not null),
      'ultimo_error', coalesce((
        select nullif(last_error, '') from public.team_alerts
        where last_error is not null order by created_at desc limit 1), '—'),
      'ultimo_creado', (select max(created_at) from public.team_alerts)
    ),

    'mensajes', jsonb_build_object(
      'pendientes', (select count(*) from public.message_jobs where status = 'pending'),
      'enviados',   (select count(*) from public.message_jobs where status = 'sent'),
      'fallados',   (select count(*) from public.message_jobs where status = 'failed'),
      'salteados',  (select count(*) from public.message_jobs where status = 'skipped'),
      'ultimo_error', coalesce((
        select nullif(last_error, '') from public.message_jobs
        where last_error is not null order by created_at desc limit 1), '—')
    ),

    'configuracion', jsonb_build_object(
      'negocios',    (select count(*) from public.tenants),
      'reglas',      (select count(*) from public.reminder_rules where enabled),
      'plantillas',  (select count(*) from public.message_templates),
      'en_prueba',   (select count(*) from public.messaging_settings where test_mode),
      'whatsapp',    (select count(*) from public.whatsapp_accounts where access_token is not null),
      'turnos_online_24h', (select count(*) from public.appointments
                            where source = 'online' and created_at > now() - interval '24 hours')
    )
  );
$$;

revoke all on function public.rpc_avisos_diagnostico() from public, anon, authenticated;
grant execute on function public.rpc_avisos_diagnostico() to service_role;
