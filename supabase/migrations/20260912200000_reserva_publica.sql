-- ============================================================================
-- Dlay Estética · Reserva online
--
-- Esto es lo único del sistema que toca alguien SIN cuenta. Así que la regla
-- es la más estricta de todo el proyecto:
--
--   `anon` NO TIENE ACCESO A NINGUNA TABLA. Ni una. Habla exclusivamente con
--   las tres funciones de acá abajo, que devuelven lo justo para reservar:
--   qué servicios hay, qué horarios quedan libres, y nada más.
--
--   Nunca un nombre, nunca un teléfono, nunca un turno ajeno. Ni siquiera
--   "ocupado por Fulana": sólo qué horarios quedan.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La estética y sus servicios
-- ---------------------------------------------------------------------------
create or replace function public.booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.id is null or not coalesce(bs.enabled, false) then null
    else jsonb_build_object(
      'tenant', jsonb_build_object(
        'name', t.name,
        'slug', t.slug,
        'timezone', t.timezone
      ),
      'settings', jsonb_build_object(
        'showPrices', bs.show_prices,
        'minAdvanceHours', bs.min_advance_hours,
        'maxDaysAhead', bs.max_days_ahead,
        'welcomeText', bs.welcome_text,
        'addressNote', bs.address_note
      ),
      'services', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'description', s.description,
          'durationMinutes', s.duration_minutes,
          -- El precio sólo viaja si la estética eligió mostrarlo.
          'priceCents', case when bs.show_prices then s.price_cents end,
          'onRequest', s.price_mode = 'on_request'
        ) order by s.sort_order, s.name)
        from public.services s
        where s.tenant_id = t.id
          and s.is_active
          and s.is_bookable_online
      ), '[]'::jsonb)
    )
  end
  from public.tenants t
  left join public.booking_settings bs on bs.tenant_id = t.id
  where lower(t.slug) = lower(trim(p_slug))
    and t.status = 'active';
$$;

comment on function public.booking_page(text) is
  'Lo que ve alguien sin cuenta al abrir la página de reservas. Devuelve null '
  'si la estética no existe o todavía no abrió su agenda al público.';

-- ---------------------------------------------------------------------------
-- 2. Qué horarios quedan libres
-- ---------------------------------------------------------------------------
-- Un horario está libre cuando se cumple TODO:
--   · cae dentro de una franja de atención de ese día
--   · el turno entero termina antes de que cierre
--   · no pisa un bloqueo de agenda
--   · cada servicio elegido tiene cupo en ese rato
--   · respeta la anticipación mínima y el horizonte máximo
create or replace function public.booking_slots(
  p_slug        text,
  p_service_ids uuid[],
  p_date        date
)
returns table (slot timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_branch   uuid;
  v_tz       text;
  v_minutes  integer;
  v_buffer   integer;
  v_found    integer;
  v_slot_min integer;
  v_advance  integer;
  v_horizon  integer;
begin
  select t.id, t.timezone, bs.slot_minutes, bs.min_advance_hours, bs.max_days_ahead
    into v_tenant, v_tz, v_slot_min, v_advance, v_horizon
  from public.tenants t
  join public.booking_settings bs on bs.tenant_id = t.id
  where lower(t.slug) = lower(trim(p_slug))
    and t.status = 'active'
    and bs.enabled;

  if v_tenant is null then
    return;
  end if;

  -- Fuera del horizonte no se ofrece nada.
  if p_date > ((now() at time zone v_tz)::date + v_horizon) then
    return;
  end if;

  select b.id into v_branch
  from public.branches b
  where b.tenant_id = v_tenant and b.is_default
  limit 1;

  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         coalesce(max(s.buffer_minutes), 0)
    into v_found, v_minutes, v_buffer
  from unnest(p_service_ids) as sel(id)
  join public.services s
    on s.id = sel.id
   and s.tenant_id = v_tenant
   and s.is_active
   and s.is_bookable_online;

  -- Si alguno de los servicios pedidos no es reservable, no se ofrece nada:
  -- mejor ningún horario que uno que después se rechaza.
  if v_found <> coalesce(array_length(p_service_ids, 1), 0) or v_minutes = 0 then
    return;
  end if;

  return query
  with franjas as (
    select bh.opens_at, bh.closes_at
    from public.business_hours bh
    where bh.branch_id = v_branch
      and bh.weekday = extract(dow from p_date)::smallint
  ),
  candidatos as (
    select generate_series(
             (p_date + f.opens_at) at time zone v_tz,
             -- El último arranque posible es el que todavía termina antes de
             -- cerrar. La limpieza puede quedar afuera del horario.
             (p_date + f.closes_at) at time zone v_tz
               - make_interval(mins => v_minutes),
             make_interval(mins => v_slot_min)
           ) as inicio
    from franjas f
  ),
  posibles as (
    select c.inicio,
           c.inicio + make_interval(mins => v_minutes) as fin,
           c.inicio + make_interval(mins => v_minutes + v_buffer) as ocupa
    from candidatos c
    where c.inicio >= now() + make_interval(hours => v_advance)
  )
  select p.inicio
  from posibles p
  where
    -- No pisa un bloqueo de agenda.
    not exists (
      select 1 from public.agenda_blocks ab
      where ab.branch_id = v_branch
        and tstzrange(ab.starts_at, ab.ends_at, '[)')
            && tstzrange(p.inicio, p.ocupa, '[)')
    )
    -- Cada servicio elegido tiene cupo en ese rato.
    and not exists (
      select 1
      from unnest(p_service_ids) as sel(id)
      join public.services s on s.id = sel.id
      where (
        select count(distinct a.id)
        from public.appointments a
        join public.appointment_services aps on aps.appointment_id = a.id
        where a.branch_id = v_branch
          and aps.service_id = s.id
          and a.status not in ('cancelled', 'no_show')
          and tstzrange(a.starts_at, a.blocks_until, '[)')
              && tstzrange(p.inicio, p.ocupa, '[)')
      ) >= s.capacity
    )
  order by p.inicio;
end;
$$;

comment on function public.booking_slots(text, uuid[], date) is
  'Horarios libres de un día. Devuelve sólo instantes: nunca quién ocupa el '
  'resto, ni cuántos turnos hay, ni ningún dato de otra persona.';

-- ---------------------------------------------------------------------------
-- 3. Reservar
-- ---------------------------------------------------------------------------
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
      'error', 'Esta estética no está tomando reservas online.');
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
    -- Se completa lo que falte, sin pisar lo que ya había cargado la estética.
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
  -- función terminó, fuera de su manejador, y la clienta vería un error crudo
  -- de base de datos en lugar de una explicación.
  set constraints all immediate;
  -- Y se vuelve a diferir: el modo queda fijado para toda la transacción, y si
  -- quedara en inmediato, una segunda reserva en el mismo pedido se
  -- verificaría antes de que existan sus servicios.
  set constraints all deferred;

  return jsonb_build_object('ok', true, 'appointmentId', v_id);

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

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- Tres funciones, y nada más. `anon` sigue sin tener acceso a ninguna tabla.
revoke all on function public.booking_page(text) from public;
revoke all on function public.booking_slots(text, uuid[], date) from public;
revoke all on function public.booking_create(text, uuid[], timestamptz, text, text, text, text, text)
  from public;

grant execute on function public.booking_page(text) to anon, authenticated;
grant execute on function public.booking_slots(text, uuid[], date) to anon, authenticated;
grant execute on function public.booking_create(text, uuid[], timestamptz, text, text, text, text, text)
  to anon, authenticated;
