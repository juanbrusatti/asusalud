-- ============================================================================
-- Dlay Estética · Cerrar la puerta de `anon`
--
-- Encontrado probando los avisos: **`anon` podía ejecutar casi todas las
-- funciones de `public`**, no sólo las de la reserva pública.
--
-- El motivo es un detalle de Supabase que el proyecto venía repitiendo mal.
-- Las migraciones cierran las funciones así:
--
--     revoke all on function ... from public;
--     grant execute on function ... to authenticated;
--
-- `public` es el pseudo-rol "todo el mundo", y revocarle a él quita el permiso
-- implícito. Pero Supabase además tiene configurado
-- `alter default privileges in schema public grant all on functions to anon`,
-- que le da a `anon` un permiso **explícito** sobre cada función nueva. Ese no
-- lo toca el `revoke ... from public`, así que quedaba puesto.
--
-- La mayoría no era explotable: las funciones `security invoker` chocan igual
-- contra la RLS, y `create_tenant` verifica que haya sesión. Pero una sí:
--
--     register_push_subscription(..., p_client_id) es `security definer` y
--     acepta el id de clienta que se le pase. Un visitante sin sesión podía
--     suscribir su propio navegador a los recordatorios de otra persona y
--     recibir su nombre, su horario y qué se hace.
--
-- Acá se revoca a `anon` en todo `public` salvo la lista de la reserva
-- pública, y se cambian los privilegios por defecto para que la próxima
-- función no nazca abierta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lo único que `anon` tiene que poder hacer
-- ---------------------------------------------------------------------------
do $do$
declare
  f record;
  -- La superficie pública: sacar turno y manejar el turno propio. Nada más.
  permitidas text[] := array[
    'booking_page',
    'booking_slots',
    'booking_create',
    'booking_manage',
    'booking_manage_slots',
    'booking_confirm',
    'booking_cancel',
    'booking_reschedule',
    'booking_subscribe_push'
  ];
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not (p.proname = any (permitidas))
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from anon', f.firma);
  end loop;
end
$do$;

-- Que la próxima función no nazca abierta. Aplica a lo que cree este rol, que
-- es el que corre las migraciones.
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------------
-- 2. Los avisos al equipo son una bitácora
-- ---------------------------------------------------------------------------
-- Sin esto, la RLS deja la escritura en cero filas en lugar de rechazarla, y
-- un día alguien "corrige" un aviso y deja de servir para discutir si llegó.
revoke insert, update, delete on public.team_alerts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. El aviso de reserva nueva espera a que el turno esté completo
-- ---------------------------------------------------------------------------
-- Un trigger `after insert` normal corre antes de que existan los servicios
-- del turno —se insertan después, en la misma transacción— así que el aviso
-- salía sin decir qué se reservó, que es justo el dato que hace falta para
-- decidir sin abrir la aplicación.
--
-- Diferido corre al cerrar la transacción, con el turno ya completo. Los
-- triggers de restricción no admiten lista de columnas, por eso el alta y los
-- cambios van por triggers separados.
drop trigger if exists appointments_alert_team on public.appointments;

create constraint trigger appointments_alert_new
  after insert on public.appointments
  deferrable initially deferred
  for each row execute function app.alert_on_appointment();

create trigger appointments_alert_change
  after update of status, starts_at on public.appointments
  for each row execute function app.alert_on_appointment();

-- ---------------------------------------------------------------------------
-- 4. Reprogramar tiene que poder distinguirse de un cambio del mostrador
-- ---------------------------------------------------------------------------
-- La función se rehace entera para agregar una línea: marcar la transacción
-- como hecha por la clienta. Sin eso, mover el turno desde el enlace no
-- generaba ningún aviso, porque el trigger no tenía cómo saber quién lo hizo.

create or replace function public.booking_reschedule(
  p_token     text,
  p_starts_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c         record;
  v_minutes integer;
  v_buffer  integer;
  v_antes   timestamptz;
  v_fecha   text;
begin
  select * into c from app.manage_context(p_token);

  if c.appointment_id is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos este turno.');
  end if;

  if not c.self_manage then
    return jsonb_build_object('ok', false,
      'error', 'Esta estética prefiere que los cambios se hagan hablando.');
  end if;

  if c.status not in ('pending', 'confirmed') or c.starts_at <= now() then
    return jsonb_build_object('ok', false,
      'error', 'Este turno ya no se puede mover.');
  end if;

  if now() >= c.starts_at - make_interval(hours => c.cancel_min_hours) then
    return jsonb_build_object('ok', false, 'late', true,
      'error', format(
        'Faltan menos de %s horas para el turno, así que hay que avisar hablando.',
        c.cancel_min_hours));
  end if;

  if c.rescheduled >= c.max_reschedules then
    return jsonb_build_object('ok', false, 'limit', true,
      'error', 'Ya moviste este turno todas las veces posibles.');
  end if;

  if p_starts_at < now() + make_interval(hours => c.min_advance_hours) then
    return jsonb_build_object('ok', false, 'error', 'Ese horario ya pasó.');
  end if;

  select coalesce(sum(aps.duration_minutes), 0),
         coalesce(max(aps.buffer_minutes), 0)
    into v_minutes, v_buffer
  from public.appointment_services aps
  where aps.appointment_id = c.appointment_id;

  v_antes := c.starts_at;
  v_fecha := to_char(v_antes at time zone c.timezone, 'DD/MM HH24:MI');

  -- Marca la transacción como "esto lo hizo la clienta" para que el aviso al
  -- equipo sepa distinguirlo de un cambio hecho desde el mostrador. Mover un
  -- turno no cambia su estado, así que acá no dispara nada más.
  perform set_config('app.by_client', 'on', true);

  update public.appointments
  set starts_at         = p_starts_at,
      ends_at           = p_starts_at + make_interval(mins => v_minutes),
      blocks_until      = p_starts_at + make_interval(mins => v_minutes + v_buffer),
      rescheduled_count = rescheduled_count + 1
  where id = c.appointment_id;

  -- Mover un turno no cambia su estado, así que el trigger del historial no
  -- escribe nada. Sin esta fila, en la agenda el turno aparecería en otro
  -- horario sin ninguna explicación de por qué.
  insert into public.appointment_status_history (
    tenant_id, appointment_id, from_status, to_status, reason, by_client
  )
  values (
    c.tenant_id, c.appointment_id, c.status, c.status,
    format('Reprogramado por la clienta: venía del %s', v_fecha),
    true
  );

  -- Se fuerza la verificación de cupos acá, que normalmente corre al cerrar la
  -- transacción: si quedara diferida, el error saltaría fuera del manejador de
  -- esta función y la clienta vería un error crudo de base de datos.
  set constraints all immediate;
  -- Y se vuelve a diferir, porque el modo queda fijado para toda la
  -- transacción.
  set constraints all deferred;

  return jsonb_build_object('ok', true);

exception
  when sqlstate '23P01' then
    return jsonb_build_object('ok', false,
      'error', 'Justo alguien tomó ese horario. Elegí otro, por favor.');
  when sqlstate '23514' then
    return jsonb_build_object('ok', false,
      'error', 'Ese horario no es válido para este turno.');
end;
$$;
