-- ============================================================================
-- Dlay Agenda · El diagnóstico tenía un punto ciego
--
-- Contaba pendientes, enviados, fallados y salteados. Faltaba `sending`: el
-- estado en el que queda un envío que el emisor tomó y nunca cerró.
--
-- Justo el caso que hay que poder ver. Un envío así desaparece de «Próximos
-- envíos» —ya no está pendiente— y no aparece en ningún contador, así que
-- desde afuera parece que se evaporó. Es lo que pasó en la primera prueba
-- real.
--
-- Se agregan los estados que faltaban y las últimas filas con su error, que es
-- lo que de verdad hace falta para saber qué pasó.
-- ============================================================================

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
      -- El que faltaba: tomado por el emisor y nunca cerrado.
      'enviando',   (select count(*) from public.message_jobs where status = 'sending'),
      'enviados',   (select count(*) from public.message_jobs where status = 'sent'),
      'fallados',   (select count(*) from public.message_jobs where status = 'failed'),
      'salteados',  (select count(*) from public.message_jobs where status = 'skipped'),
      'cancelados', (select count(*) from public.message_jobs where status = 'cancelled'),
      'ultimo_error', coalesce((
        select nullif(last_error, '') from public.message_jobs
        where last_error is not null order by created_at desc limit 1), '—'),
      -- Las últimas filas, sin datos de nadie: alcanza para saber qué pasó y
      -- se puede pegar en un chat sin pensarlo.
      'ultimos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'estado',    j.status,
                 'canal',     j.channel,
                 'para',      j.scheduled_for,
                 'intentos',  j.attempts,
                 'costo',     j.cost_cents,
                 'error',     coalesce(nullif(j.last_error, ''), nullif(j.skip_reason, '')),
                 'creado',    j.created_at
               ) order by j.created_at desc)
        from (
          select * from public.message_jobs order by created_at desc limit 8
        ) j
      ), '[]'::jsonb)
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
