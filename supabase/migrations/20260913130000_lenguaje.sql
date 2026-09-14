-- ============================================================================
-- Dlay Agenda · El producto deja de ser sólo para estéticas
--
-- El sistema nació para una estética y el vocabulario quedó pegado a eso: «tu
-- estética», «la clienta», «la dueña». Probándolo se vio que sirve igual para
-- una barbería, un consultorio o un taller, y que el femenino por defecto deja
-- afuera a los hombres que atienden y a los que se atienden.
--
-- El texto de las pantallas se cambió donde vive, en el código. Acá están las
-- funciones de la base que devuelven mensajes a una persona o escriben texto
-- que después se lee: el motivo de una cancelación, el error de una reserva.
--
-- No cambia ninguna lógica. Son las mismas funciones con otras palabras, y se
-- rehacen enteras porque una función no se edita por partes.
-- ============================================================================

create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant public.tenants;
  v_branch uuid;
begin
  if v_uid is null then
    raise exception 'Hace falta estar autenticado para crear un negocio.'
      using errcode = '42501';
  end if;

  insert into public.tenants (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning * into v_tenant;

  insert into public.memberships (tenant_id, user_id, role, status)
  values (v_tenant.id, v_uid, 'owner', 'active');

  insert into public.branches (tenant_id, name, is_default)
  values (v_tenant.id, 'Principal', true)
  returning id into v_branch;

  insert into public.messaging_settings (tenant_id) values (v_tenant.id);
  insert into public.booking_settings (tenant_id) values (v_tenant.id);

  -- Un horario razonable para empezar, que después se ajusta.
  insert into public.business_hours (tenant_id, branch_id, weekday, opens_at, closes_at)
  select v_tenant.id, v_branch, d, '09:00'::time, '19:00'::time
  from generate_series(1, 5) as d;

  return v_tenant;
end;
$$;

create or replace function public.book_appointment(
  p_client      uuid,
  p_service_ids uuid[],
  p_starts_at   timestamptz,
  p_notes       text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant  uuid;
  v_branch  uuid;
  v_id      uuid;
  v_minutes integer;
  v_buffer  integer;
  v_total   bigint;
  v_found   integer;
begin
  -- La ficha ya pasó por RLS: si no se ve, no existe para quien llama.
  select c.tenant_id into v_tenant
  from public.clients c where c.id = p_client;

  if v_tenant is null then
    raise exception 'No encontramos esa ficha de cliente.' using errcode = '42501';
  end if;

  select b.id into v_branch
  from public.branches b
  where b.tenant_id = v_tenant and b.is_default
  limit 1;

  if v_branch is null then
    raise exception 'El negocio no tiene una sucursal principal.' using errcode = '23514';
  end if;

  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         coalesce(max(s.buffer_minutes), 0),
         coalesce(sum(s.price_cents), 0)
    into v_found, v_minutes, v_buffer, v_total
  from unnest(p_service_ids) as sel(id)
  join public.services s on s.id = sel.id and s.tenant_id = v_tenant;

  if v_found <> coalesce(array_length(p_service_ids, 1), 0) then
    raise exception 'Alguno de esos servicios no es de este negocio.'
      using errcode = '42501';
  end if;

  if v_minutes = 0 then
    raise exception 'Elegí al menos un servicio.' using errcode = '23514';
  end if;

  insert into public.appointments (
    tenant_id, branch_id, client_id,
    starts_at, ends_at, blocks_until,
    status, source, price_cents, notes, created_by
  )
  values (
    v_tenant, v_branch, p_client,
    p_starts_at,
    p_starts_at + make_interval(mins => v_minutes),
    p_starts_at + make_interval(mins => v_minutes + v_buffer),
    'confirmed', 'staff', v_total, nullif(trim(coalesce(p_notes, '')), ''),
    (select auth.uid())
  )
  returning id into v_id;

  -- `with ordinality` conserva el orden en que se eligieron los servicios.
  insert into public.appointment_services (
    tenant_id, appointment_id, service_id,
    duration_minutes, buffer_minutes, price_cents, position
  )
  select v_tenant, v_id, s.id,
         s.duration_minutes, s.buffer_minutes, s.price_cents, sel.ord - 1
  from unnest(p_service_ids) with ordinality as sel(id, ord)
  join public.services s on s.id = sel.id and s.tenant_id = v_tenant;

  return v_id;
end;
$$;

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
    -- Suscripción de un cliente: el negocio sale de su ficha.
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
    raise exception 'No encontramos el negocio.' using errcode = '42501';
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

create or replace function public.booking_create(
  p_slug        text,
  p_service_ids uuid[],
  p_starts_at   timestamptz,
  p_first_name  text,
  p_last_name   text,
  p_phone       text,
  p_email       text default null,
  p_notes       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_branch   uuid;
  v_tz       text;
  v_max_open integer;
  v_client   uuid;
  v_id       uuid;
  v_minutes  integer;
  v_buffer   integer;
  v_total    bigint;
  v_found    integer;
  v_abiertos integer;
begin
  select t.id, t.timezone, bs.max_open_per_client
    into v_tenant, v_tz, v_max_open
  from public.tenants t
  join public.booking_settings bs on bs.tenant_id = t.id
  where lower(t.slug) = lower(trim(p_slug))
    and t.status = 'active'
    and bs.enabled;

  if v_tenant is null then
    return jsonb_build_object('ok', false,
      'error', 'Este negocio no está tomando reservas online.');
  end if;

  if coalesce(trim(p_first_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Poné tu nombre.');
  end if;

  if coalesce(trim(p_phone), '') = '' then
    return jsonb_build_object('ok', false,
      'error', 'Hace falta un teléfono para poder avisarte.');
  end if;

  select b.id into v_branch
  from public.branches b where b.tenant_id = v_tenant and b.is_default limit 1;

  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         coalesce(max(s.buffer_minutes), 0),
         coalesce(sum(s.price_cents), 0)
    into v_found, v_minutes, v_buffer, v_total
  from unnest(p_service_ids) as sel(id)
  join public.services s
    on s.id = sel.id and s.tenant_id = v_tenant
   and s.is_active and s.is_bookable_online;

  if v_found <> coalesce(array_length(p_service_ids, 1), 0) or v_minutes = 0 then
    return jsonb_build_object('ok', false, 'error', 'Elegí un servicio válido.');
  end if;

  -- Se busca la ficha por teléfono. Si no existe se crea: la persona que
  -- reserva online puede no estar cargada todavía.
  select id into v_client
  from public.clients
  where tenant_id = v_tenant and phone_e164 = p_phone
  limit 1;

  if v_client is null then
    insert into public.clients
      (tenant_id, first_name, last_name, phone_e164, phone_raw, email)
    values (
      v_tenant, trim(p_first_name), nullif(trim(coalesce(p_last_name, '')), ''),
      p_phone, p_phone, nullif(lower(trim(coalesce(p_email, ''))), '')
    )
    returning id into v_client;
  else
    -- Se completa lo que falte, sin pisar lo que ya había cargado el negocio.
    update public.clients
    set email = coalesce(email, nullif(lower(trim(coalesce(p_email, ''))), '')),
        last_name = coalesce(last_name, nullif(trim(coalesce(p_last_name, '')), ''))
    where id = v_client;
  end if;

  -- Freno contra quien reserva media agenda. No es paranoia: una agenda
  -- pública sin este límite se llena de turnos fantasma en una tarde.
  select count(*) into v_abiertos
  from public.appointments a
  where a.client_id = v_client
    and a.starts_at > now()
    and a.status in ('pending', 'confirmed');

  if v_abiertos >= v_max_open then
    return jsonb_build_object('ok', false, 'error', format(
      'Ya tenés %s turnos reservados. Si querés otro, escribinos.', v_abiertos));
  end if;

  insert into public.appointments (
    tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until,
    status, source, price_cents, notes
  )
  values (
    v_tenant, v_branch, v_client, p_starts_at,
    p_starts_at + make_interval(mins => v_minutes),
    p_starts_at + make_interval(mins => v_minutes + v_buffer),
    'confirmed', 'online', v_total,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  insert into public.appointment_services (
    tenant_id, appointment_id, service_id,
    duration_minutes, buffer_minutes, price_cents, position
  )
  select v_tenant, v_id, s.id,
         s.duration_minutes, s.buffer_minutes, s.price_cents, sel.ord - 1
  from unnest(p_service_ids) with ordinality as sel(id, ord)
  join public.services s on s.id = sel.id;

  -- Se fuerza acá la verificación de cupos, que normalmente corre al cerrar la
  -- transacción. Si se dejara diferida, el error saltaría DESPUÉS de que esta
  -- función terminó, fuera de su manejador, y el cliente vería un error crudo
  -- de base de datos en lugar de una explicación.
  set constraints all immediate;
  -- Y se vuelve a diferir: el modo queda fijado para toda la transacción, y si
  -- quedara en inmediato, una segunda reserva en el mismo pedido se
  -- verificaría antes de que existan sus servicios.
  set constraints all deferred;

  -- El enlace de autogestión se devuelve acá y en ningún otro lado: es la
  -- única vez que se puede entregar sin que nadie tenga que demostrar quién
  -- es. Después sólo viaja dentro de los recordatorios, a la misma persona.
  return jsonb_build_object(
    'ok', true,
    'appointmentId', v_id,
    'manageToken', (
      select a.manage_token from public.appointments a where a.id = v_id
    )
  );

exception
  -- Alguien tomó ese mismo horario mientras esta persona completaba sus datos.
  -- El manejador deshace todo lo que hizo la función, así que no queda ningún
  -- turno a medias.
  when sqlstate '23P01' then
    return jsonb_build_object('ok', false,
      'error', 'Justo alguien tomó ese horario. Elegí otro, por favor.');
  when sqlstate '23514' then
    return jsonb_build_object('ok', false,
      'error', 'Ese horario no es válido para los servicios que elegiste.');
end;
$$;

create or replace function public.booking_cancel(
  p_token  text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       record;
  v_razon text;
begin
  select * into c from app.manage_context(p_token);

  if c.appointment_id is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos este turno.');
  end if;

  if not c.self_manage then
    return jsonb_build_object('ok', false,
      'error', 'Este negocio prefiere que los cambios se hagan hablando.');
  end if;

  if c.status not in ('pending', 'confirmed') or c.starts_at <= now() then
    return jsonb_build_object('ok', false,
      'error', 'Este turno ya no se puede cancelar.');
  end if;

  if now() >= c.starts_at - make_interval(hours => c.cancel_min_hours) then
    return jsonb_build_object('ok', false, 'late', true,
      'error', format(
        'Faltan menos de %s horas para el turno, así que hay que avisar hablando.',
        c.cancel_min_hours));
  end if;

  -- Queda claro en la agenda quién lo canceló, sin depender de que alguien
  -- recuerde después de qué se trataba.
  v_razon := 'Cancelado por el cliente'
    || case when coalesce(trim(p_reason), '') = '' then ''
            else ': ' || left(trim(p_reason), 200) end;

  perform set_config('app.by_client', 'on', true);
  update public.appointments
  set status        = 'cancelled',
      cancelled_at  = now(),
      cancel_reason = v_razon
  where id = c.appointment_id;

  return jsonb_build_object('ok', true);
end;
$$;

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
      'error', 'Este negocio prefiere que los cambios se hagan hablando.');
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

  -- Marca la transacción como "esto lo hizo el cliente" para que el aviso al
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
    format('Reprogramado por el cliente: venía del %s', v_fecha),
    true
  );

  -- Se fuerza la verificación de cupos acá, que normalmente corre al cerrar la
  -- transacción: si quedara diferida, el error saltaría fuera del manejador de
  -- esta función y el cliente vería un error crudo de base de datos.
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

