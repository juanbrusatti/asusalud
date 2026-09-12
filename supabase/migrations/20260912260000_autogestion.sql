-- ============================================================================
-- Dlay Estética · La clienta se maneja sola
--
-- Hoy, para mover un turno, la clienta escribe, alguien lee, alguien contesta,
-- alguien cancela a mano y alguien agenda de nuevo. Son cuatro pasos de una
-- persona para algo que la clienta podría hacer sola en diez segundos, y el
-- horario liberado tarda horas en volver a ofrecerse.
--
-- Con esto, cada turno tiene su propia dirección web. Quien la tiene puede
-- confirmar, cancelar o reprogramar, y la agenda de la estética se entera en
-- el momento.
--
-- Tres decisiones que definen el módulo:
--
--   1. EL ENLACE ES LA LLAVE. No hay cuenta ni contraseña: pedirle a una
--      clienta que se registre para mover un turno es garantizar que siga
--      escribiendo por WhatsApp. El enlace lleva un token propio, distinto del
--      identificador del turno, porque ese identificador ya viaja en otros
--      lados —los botones de WhatsApp, las pantallas del equipo— y una llave
--      que se puede correlacionar con otra cosa deja de ser una llave.
--
--   2. HAY UNA HORA DE CORTE. Cancelar dos horas antes deja un hueco que no se
--      llena con nadie. Por defecto son 24 h, y lo decide cada estética. Pasado
--      el corte no se dice "no": se muestra el teléfono, que es lo que la
--      persona necesita en ese momento.
--
--   3. REPROGRAMAR TIENE LÍMITE. Sin tope, un solo turno puede pasearse por la
--      agenda toda la semana. Por defecto, dos veces.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El token del turno
-- ---------------------------------------------------------------------------
create or replace function app.new_manage_token()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 24 bytes al azar en base64 apto para direcciones web: 32 caracteres sin
  -- '+', '/' ni '='. Adivinarlo por fuerza bruta no es una amenaza realista.
  select translate(
           encode(extensions.gen_random_bytes(24), 'base64'),
           '+/=', '-_'
         );
$$;

comment on function app.new_manage_token() is
  'La llave del enlace de autogestión. Es un valor propio y no el id del '
  'turno, que ya viaja en los botones de WhatsApp y en las pantallas internas.';

alter table public.appointments
  add column manage_token text,
  -- Cuántas veces se movió sola la clienta. El equipo puede moverlo las que
  -- quiera: el tope es para la autogestión.
  add column rescheduled_count integer not null default 0;

update public.appointments set manage_token = app.new_manage_token()
where manage_token is null;

alter table public.appointments
  alter column manage_token set default app.new_manage_token(),
  alter column manage_token set not null;

create unique index appointments_manage_token_key
  on public.appointments (manage_token);

comment on column public.appointments.manage_token is
  'Llave del enlace público del turno. Quien la tiene puede confirmar, '
  'cancelar o reprogramar ese turno y nada más.';

grant execute on function app.new_manage_token() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Qué permite cada estética
-- ---------------------------------------------------------------------------
alter table public.booking_settings
  add column self_manage boolean not null default true,
  add column cancel_min_hours integer not null default 24,
  add column max_reschedules integer not null default 2,
  -- Adónde mandar a quien llegó tarde para cambiarlo solo. Sin esto, el corte
  -- es una puerta cerrada sin timbre.
  add column contact_phone text,
  add constraint booking_settings_cancel_window
    check (cancel_min_hours between 0 and 168),
  add constraint booking_settings_reschedules
    check (max_reschedules between 0 and 10);

comment on column public.booking_settings.self_manage is
  'Si la clienta puede cancelar y reprogramar desde el enlace de su turno. Es '
  'independiente de `enabled`: abrir la agenda al público y dejar que alguien '
  'mueva el turno que ya tiene son dos decisiones distintas. Apagarlo no '
  'invalida los enlaces: siguen mostrando el turno, sin botones.';

-- ---------------------------------------------------------------------------
-- 3. Quién hizo el cambio
-- ---------------------------------------------------------------------------
-- Sin esto, una cancelación hecha por la clienta figura como "alguien del
-- equipo": el historial diría que lo canceló la estética, que es justo lo
-- contrario de lo que pasó.
alter table public.appointment_status_history
  add column by_client boolean not null default false;

comment on column public.appointment_status_history.by_client is
  'El cambio lo hizo la clienta desde el enlace de su turno, no el equipo.';

create or replace function app.record_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Las funciones de autogestión lo marcan antes de tocar el turno. Es una
  -- variable de la transacción, así que no se filtra a ninguna otra.
  v_clienta boolean := coalesce(
    current_setting('app.by_client', true) = 'on', false
  );
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.appointment_status_history (
    tenant_id, appointment_id, from_status, to_status, reason, changed_by,
    by_client
  )
  values (
    new.tenant_id,
    new.id,
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    new.cancel_reason,
    -- Si lo hizo la clienta, el autor queda en nulo aunque haya una sesión
    -- abierta: puede pasar que la dueña abra el enlace de su propia clienta
    -- desde su teléfono, y anotarla a ella como quien canceló sería mentir.
    case when v_clienta then null else (select auth.uid()) end,
    v_clienta
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Los horarios libres, en un solo lugar
-- ---------------------------------------------------------------------------
-- La reserva pública y la reprogramación calculan exactamente lo mismo, con
-- una diferencia: al mover un turno hay que ignorar el lugar que ese turno
-- ocupa hoy, o se tapa a sí mismo. Duplicar sesenta líneas de lógica sutil por
-- esa única diferencia es la forma segura de que un día dejen de coincidir.
create or replace function app.free_slots(
  p_branch      uuid,
  p_timezone    text,
  p_service_ids uuid[],
  p_date        date,
  p_minutes     integer,
  p_buffer      integer,
  p_slot_min    integer,
  p_advance     integer,
  p_exclude     uuid default null
)
returns table (slot timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with franjas as (
    select bh.opens_at, bh.closes_at
    from public.business_hours bh
    where bh.branch_id = p_branch
      and bh.weekday = extract(dow from p_date)::smallint
  ),
  candidatos as (
    select generate_series(
             (p_date + f.opens_at) at time zone p_timezone,
             -- El último arranque posible es el que todavía termina antes de
             -- cerrar. La limpieza puede quedar afuera del horario.
             (p_date + f.closes_at) at time zone p_timezone
               - make_interval(mins => p_minutes),
             make_interval(mins => p_slot_min)
           ) as inicio
    from franjas f
  ),
  posibles as (
    select c.inicio,
           c.inicio + make_interval(mins => p_minutes + p_buffer) as ocupa
    from candidatos c
    where c.inicio >= now() + make_interval(hours => p_advance)
  )
  select p.inicio
  from posibles p
  where
    not exists (
      select 1 from public.agenda_blocks ab
      where ab.branch_id = p_branch
        and tstzrange(ab.starts_at, ab.ends_at, '[)')
            && tstzrange(p.inicio, p.ocupa, '[)')
    )
    and not exists (
      select 1
      from unnest(p_service_ids) as sel(id)
      join public.services s on s.id = sel.id
      where (
        select count(distinct a.id)
        from public.appointments a
        join public.appointment_services aps on aps.appointment_id = a.id
        where a.branch_id = p_branch
          and aps.service_id = s.id
          and a.status not in ('cancelled', 'no_show')
          and (p_exclude is null or a.id <> p_exclude)
          and tstzrange(a.starts_at, a.blocks_until, '[)')
              && tstzrange(p.inicio, p.ocupa, '[)')
      ) >= s.capacity
    )
  order by p.inicio;
$$;

comment on function app.free_slots is
  'El cálculo de disponibilidad, compartido por la reserva pública y la '
  'reprogramación. `p_exclude` ignora un turno: el que se está moviendo, que '
  'si no se tapa a sí mismo.';

-- La reserva pública pasa a apoyarse en la función común.
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
  select * from app.free_slots(
    v_branch, v_tz, p_service_ids, p_date,
    v_minutes, v_buffer, v_slot_min, v_advance, null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Leer el turno desde el enlace
-- ---------------------------------------------------------------------------
-- Resuelve el token una sola vez y deja todo lo que las demás funciones
-- necesitan. Es interna: `anon` nunca la llama directo.
create or replace function app.manage_context(p_token text)
returns table (
  appointment_id   uuid,
  tenant_id        uuid,
  branch_id        uuid,
  timezone         text,
  slug             text,
  tenant_name      text,
  starts_at        timestamptz,
  status           public.appointment_status,
  rescheduled      integer,
  self_manage      boolean,
  booking_open     boolean,
  cancel_min_hours integer,
  max_reschedules  integer,
  contact_phone    text,
  slot_minutes     integer,
  min_advance_hours integer,
  max_days_ahead   integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.tenant_id, a.branch_id, t.timezone, t.slug, t.name,
         a.starts_at, a.status, a.rescheduled_count,
         -- A propósito NO depende de que la agenda pública esté abierta: son
         -- dos decisiones distintas. Una estética puede no querer que
         -- cualquiera saque turno por internet y querer igual que su clienta
         -- pueda avisar sola que no viene.
         coalesce(bs.self_manage, false),
         coalesce(bs.enabled, false),
         coalesce(bs.cancel_min_hours, 24),
         coalesce(bs.max_reschedules, 2),
         bs.contact_phone,
         coalesce(bs.slot_minutes, 15),
         coalesce(bs.min_advance_hours, 2),
         coalesce(bs.max_days_ahead, 60)
  from public.appointments a
  join public.tenants t on t.id = a.tenant_id and t.status = 'active'
  left join public.booking_settings bs on bs.tenant_id = a.tenant_id
  where a.manage_token = p_token
    and length(coalesce(p_token, '')) >= 16;
$$;

create or replace function public.booking_manage(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c           record;
  v_corte     timestamptz;
  v_puede     boolean;
  v_cancelar  boolean;
  v_mover     boolean;
  v_motivo    text := null;
begin
  select * into c from app.manage_context(p_token);

  -- Un token inventado y uno de una estética dada de baja dan lo mismo.
  if c.appointment_id is null then
    return jsonb_build_object('ok', false,
      'error', 'No encontramos este turno. Puede que el enlace esté viejo.');
  end if;

  v_corte := c.starts_at - make_interval(hours => c.cancel_min_hours);
  v_puede := c.self_manage and c.status in ('pending', 'confirmed');

  v_cancelar := v_puede and now() < v_corte;
  v_mover    := v_cancelar and c.rescheduled < c.max_reschedules;

  if c.status = 'cancelled' then
    v_motivo := 'cancelado';
  elsif c.status in ('attended', 'no_show') or c.starts_at <= now() then
    v_motivo := 'pasado';
  elsif not c.self_manage then
    v_motivo := 'cerrado';
  elsif not v_cancelar then
    v_motivo := 'tarde';
  elsif not v_mover then
    v_motivo := 'limite';
  end if;

  return jsonb_build_object(
    'ok', true,
    'tenant', jsonb_build_object(
      'name', c.tenant_name,
      'slug', c.slug,
      'timezone', c.timezone,
      'phone', c.contact_phone
    ),
    'appointment', (
      select jsonb_build_object(
        'startsAt', a.starts_at,
        'endsAt',   a.ends_at,
        'status',   a.status,
        'priceCents', case when bs.show_prices then a.price_cents end,
        -- Sólo el nombre de pila, y para que quien abre el enlace reconozca
        -- que es su turno. El apellido y el teléfono no hacen falta.
        'firstName', cl.first_name,
        'services', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'name', coalesce(s.name, 'Servicio'),
                   'minutes', aps.duration_minutes
                 ) order by aps.position)
          from public.appointment_services aps
          left join public.services s on s.id = aps.service_id
          where aps.appointment_id = a.id
        ), '[]'::jsonb)
      )
      from public.appointments a
      left join public.clients cl on cl.id = a.client_id
      left join public.booking_settings bs on bs.tenant_id = a.tenant_id
      where a.id = c.appointment_id
    ),
    'can', jsonb_build_object(
      'confirm',    v_puede and c.status = 'pending' and c.starts_at > now(),
      'cancel',     v_cancelar,
      'reschedule', v_mover
    ),
    'why', v_motivo,
    -- Para ofrecerle sacar otro turno sólo si la agenda pública está abierta.
    -- Un enlace a una página que va a decirle que no se puede reservar es
    -- peor que no ofrecer nada.
    'bookingOpen', c.booking_open,
    'cancelMinHours', c.cancel_min_hours,
    'reschedulesLeft', greatest(c.max_reschedules - c.rescheduled, 0)
  );
end;
$$;

comment on function public.booking_manage(text) is
  'El turno visto desde su enlace. Devuelve el nombre de pila y nada más de la '
  'ficha: el enlace sirve para manejar ese turno, no para consultar datos.';

-- ---------------------------------------------------------------------------
-- 6. Horarios para mover el turno
-- ---------------------------------------------------------------------------
create or replace function public.booking_manage_slots(
  p_token text,
  p_date  date
)
returns table (slot timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c         record;
  v_ids     uuid[];
  v_minutes integer;
  v_buffer  integer;
begin
  select * into c from app.manage_context(p_token);

  if c.appointment_id is null
     or not c.self_manage
     or c.status not in ('pending', 'confirmed')
     or now() >= c.starts_at - make_interval(hours => c.cancel_min_hours)
     or c.rescheduled >= c.max_reschedules
  then
    return;
  end if;

  if p_date > ((now() at time zone c.timezone)::date + c.max_days_ahead) then
    return;
  end if;

  -- Las duraciones salen del turno, no del servicio: si el servicio cambió de
  -- duración después de agendado, el turno conserva la que tenía.
  select array_agg(aps.service_id),
         coalesce(sum(aps.duration_minutes), 0),
         coalesce(max(aps.buffer_minutes), 0)
    into v_ids, v_minutes, v_buffer
  from public.appointment_services aps
  where aps.appointment_id = c.appointment_id;

  if v_minutes = 0 then
    return;
  end if;

  return query
  select * from app.free_slots(
    c.branch_id, c.timezone, v_ids, p_date,
    v_minutes, v_buffer, c.slot_minutes, c.min_advance_hours,
    -- Se ignora a sí mismo: si no, el turno taparía el horario que ocupa hoy y
    -- no se podría mover media hora más tarde.
    c.appointment_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Confirmar
-- ---------------------------------------------------------------------------
create or replace function public.booking_confirm(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from app.manage_context(p_token);

  if c.appointment_id is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos este turno.');
  end if;

  if c.status <> 'pending' or c.starts_at <= now() then
    return jsonb_build_object('ok', false,
      'error', 'Este turno ya no se puede confirmar.');
  end if;

  perform set_config('app.by_client', 'on', true);
  update public.appointments set status = 'confirmed' where id = c.appointment_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Cancelar
-- ---------------------------------------------------------------------------
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
      'error', 'Esta estética prefiere que los cambios se hagan hablando.');
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
  v_razon := 'Cancelado por la clienta'
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

-- ---------------------------------------------------------------------------
-- 9. Reprogramar
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 10. El enlace viaja en los mensajes
-- ---------------------------------------------------------------------------
-- Un enlace que nadie recibe no sirve de nada. El emisor lo arma con la
-- dirección pública del sitio y lo deja disponible como {{link}}.
insert into public.platform_settings (key, value)
values ('site_url', 'http://localhost:3000')
on conflict (key) do nothing;

-- Las dos funciones se rehacen enteras porque cambia lo que devuelven, y
-- Postgres no deja ampliar el resultado de una función existente. El único
-- cambio respecto de 20260912180000_push_payload.sql es la última columna.
drop function if exists public.rpc_jobs_payload(uuid[]);
drop function if exists app.jobs_payload(uuid[]);

create function app.jobs_payload(p_ids uuid[])
returns table (
  job_id          uuid,
  tenant_id       uuid,
  client_id       uuid,
  channel         public.message_channel,
  test_mode       boolean,
  client_name     text,
  client_email    text,
  client_phone    text,
  template_subject text,
  template_body   text,
  provider_name   text,
  provider_language text,
  quick_replies   text[],
  appointment_id  uuid,
  tenant_name     text,
  tenant_timezone text,
  appointment_at  timestamptz,
  service_names   text,
  phone_number_id text,
  access_token    text,
  manage_url      text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id,
    j.tenant_id,
    j.client_id,
    j.channel,
    coalesce(ms.test_mode, true),
    trim(c.first_name || ' ' || coalesce(c.last_name, '')),
    c.email,
    c.phone_e164,
    t.subject,
    t.body,
    t.provider_name,
    t.provider_language,
    coalesce(t.quick_replies, '{}'),
    j.appointment_id,
    te.name,
    te.timezone,
    a.starts_at,
    (
      select string_agg(s.name, ' + ' order by aps.position)
      from public.appointment_services aps
      join public.services s on s.id = aps.service_id
      where aps.appointment_id = a.id
    ),
    wa.phone_number_id,
    wa.access_token,
    case when a.manage_token is not null then
      rtrim((select ps.value from public.platform_settings ps
             where ps.key = 'site_url'), '/')
      || '/t/' || a.manage_token
    end
  from public.message_jobs j
  join public.clients c on c.id = j.client_id
  join public.tenants te on te.id = j.tenant_id
  left join public.messaging_settings ms on ms.tenant_id = j.tenant_id
  left join public.message_templates t on t.id = j.template_id
  left join public.appointments a on a.id = j.appointment_id
  left join public.whatsapp_accounts wa on wa.tenant_id = j.tenant_id
  where j.id = any (p_ids);
$$;

create function public.rpc_jobs_payload(p_ids uuid[])
returns table (
  job_id          uuid,
  tenant_id       uuid,
  client_id       uuid,
  channel         public.message_channel,
  test_mode       boolean,
  client_name     text,
  client_email    text,
  client_phone    text,
  template_subject text,
  template_body   text,
  provider_name   text,
  provider_language text,
  quick_replies   text[],
  appointment_id  uuid,
  tenant_name     text,
  tenant_timezone text,
  appointment_at  timestamptz,
  service_names   text,
  phone_number_id text,
  access_token    text,
  manage_url      text
)
language sql
security definer
set search_path = ''
as $$
  select * from app.jobs_payload(p_ids);
$$;


revoke all on function app.jobs_payload(uuid[]) from public;
grant execute on function app.jobs_payload(uuid[]) to service_role;
revoke all on function public.rpc_jobs_payload(uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_jobs_payload(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 11. Permisos
-- ---------------------------------------------------------------------------
-- `anon` sigue sin tener acceso a ninguna tabla: cuatro funciones más, y nada
-- más que eso.
revoke all on function public.booking_manage(text) from public;
revoke all on function public.booking_manage_slots(text, date) from public;
revoke all on function public.booking_confirm(text) from public;
revoke all on function public.booking_cancel(text, text) from public;
revoke all on function public.booking_reschedule(text, timestamptz) from public;
revoke all on function app.manage_context(text) from public;
revoke all on function app.free_slots(uuid, text, uuid[], date, integer, integer, integer, integer, uuid) from public;

grant execute on function public.booking_manage(text) to anon, authenticated;
grant execute on function public.booking_manage_slots(text, date) to anon, authenticated;
grant execute on function public.booking_confirm(text) to anon, authenticated;
grant execute on function public.booking_cancel(text, text) to anon, authenticated;
grant execute on function public.booking_reschedule(text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Reservar devuelve el enlace del turno
-- ---------------------------------------------------------------------------
-- Quien acaba de sacar el turno por internet es quien más probabilidades tiene
-- de guardar el enlace: lo tiene en la mano y le acaba de importar. Esperar al
-- recordatorio significa que hasta entonces no tiene forma de volver.
--
-- La función se rehace entera porque cambia lo que devuelve; el único cambio
-- respecto de 20260912200000_reserva_publica.sql está al final.

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
