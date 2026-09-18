-- ============================================================================
-- Dlay Agenda · El freno que faltaba en la reserva online
--
-- Ya había uno: nadie puede tener más de N turnos abiertos a la vez, tres por
-- defecto. Ese freno para el caso común —una persona molesta que reserva media
-- agenda— y no se toca.
--
-- Lo que no paraba es a alguien que cambia el teléfono en cada reserva. Como
-- la ficha se busca por teléfono, un número nuevo es una persona nueva y el
-- tope vuelve a cero. Con eso, un guión de diez líneas llena la agenda de una
-- semana.
--
-- El freno nuevo apunta a eso y a nada más: cuántas FICHAS NUEVAS puede crear
-- la página pública por hora. Un negocio real suma unos pocos clientes nuevos
-- por día; un guión hace cientos por minuto. Y lo importante: a quien ya es
-- cliente no lo toca nunca, porque su ficha ya existe.
--
-- La función se reescribe entera porque Postgres no sabe parchear un cuerpo,
-- pero sale de la versión vigente palabra por palabra: acá abajo lo único
-- nuevo son las dos variables, el tope que se lee y el bloque que frena.
-- ============================================================================

alter table public.booking_settings
  add column max_new_clients_per_hour integer not null default 6
    check (max_new_clients_per_hour between 1 and 200);

comment on column public.booking_settings.max_new_clients_per_hour is
  'Cuántas fichas nuevas puede crear la reserva online en una hora. No afecta '
  'a quien ya es cliente: su ficha ya existe.';

create index if not exists clients_tenant_creado_idx
  on public.clients (tenant_id, created_at desc);

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
  v_max_new  integer;
  v_nuevas   integer;
begin
  select t.id, t.timezone, bs.max_open_per_client, bs.max_new_clients_per_hour
    into v_tenant, v_tz, v_max_open, v_max_new
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
    -- Acá se para a quien cambia de teléfono en cada reserva. El tope de
    -- turnos abiertos de más abajo no lo alcanza: con un número nuevo, la
    -- ficha es nueva y su cuenta arranca de cero.
    --
    -- Va ANTES de insertar: una ficha basura ya ensucia la lista de clientes
    -- aunque después el turno no llegue a agendarse.
    select count(*) into v_nuevas
    from public.clients c
    where c.tenant_id = v_tenant
      and c.created_at > now() - interval '1 hour';

    if v_nuevas >= v_max_new then
      return jsonb_build_object('ok', false, 'error',
        'Estamos recibiendo muchas reservas juntas. Probá en un rato o escribinos.');
    end if;

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
    -- Antes nacía 'confirmed'. Reservar no es confirmar: quien sacó turno
    -- hace tres semanas no dijo nada sobre mañana, y es justo lo que el
    -- equipo necesita saber al mirar la agenda del día siguiente.
    'pending', 'online', v_total,
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

revoke all on function public.booking_create(text, uuid[], timestamptz, text, text, text, text, text)
  from public;
grant execute on function public.booking_create(text, uuid[], timestamptz, text, text, text, text, text)
  to anon, authenticated;
