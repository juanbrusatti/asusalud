-- ============================================================================
-- ¿Por qué no llega el aviso al equipo?
--
-- Pegar entero en el SQL editor del proyecto. Devuelve una fila por cada cosa
-- que tiene que estar bien, en el orden en que se rompen. La primera que dice
-- algo raro es la que hay que arreglar; las de abajo son consecuencia.
-- ============================================================================

select 1 as orden,
       'Suscripciones del equipo' as revisar,
       (select count(*)::text from public.push_subscriptions
        where user_id is not null) as valor,
       'Cero significa que «activar notificaciones» no llegó a guardar nada.'
         as si_falla

union all select 2,
       'Turnos por reserva online (24 h)',
       (select count(*)::text from public.appointments
        where source = 'online' and created_at > now() - interval '24 hours'),
       'Los turnos que carga el equipo NO avisan, a propósito. Sólo los que '
       'entran por el link público.'

union all select 3,
       'Avisos encolados (24 h)',
       (select count(*)::text from public.team_alerts
        where created_at > now() - interval '24 hours'),
       'Si hay turnos online y acá hay cero, no había nadie suscripto cuando '
       'entró la reserva.'

union all select 4,
       'Avisos sin entregar',
       (select count(*)::text from public.team_alerts
        where sent_at is null and failed_at is null),
       'Están en la cola y nadie los está sacando: falta el emisor.'

union all select 5,
       'Avisos entregados',
       (select count(*)::text from public.team_alerts where sent_at is not null),
       ''

union all select 6,
       'Último error de envío',
       coalesce((select nullif(last_error, '') from public.team_alerts
                 where last_error is not null
                 order by created_at desc limit 1), '—'),
       'Si dice algo, el emisor corrió y falló al entregar.'

union all select 7,
       'dispatch_url configurada',
       (select case when exists (
          select 1 from public.platform_settings
          where key = 'dispatch_url' and coalesce(value, '') <> ''
        ) then 'sí' else 'NO' end),
       'Sin esto la base nunca llama al emisor: la cola se llena y queda ahí.'

union all select 8,
       'site_url configurada',
       (select coalesce(nullif(value, ''), 'NO')
        from public.platform_settings where key = 'site_url'),
       'Es la dirección que se arma dentro de los mensajes.'

union all select 9,
       'Tareas del reloj',
       (select count(*)::text from cron.job),
       'Tienen que ser dos: planificar y despachar.'

order by orden;
