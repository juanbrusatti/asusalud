-- ============================================================================
-- Dlay Estética · Agenda
--
-- El turno es la pieza donde se cruzan servicios y clientes, así que acá se
-- juegan las decisiones más delicadas del sistema.
--
--   1. CUPOS SIMULTÁNEOS. Asusalud atiende a dos o tres personas a la vez
--      porque el aparato trabaja solo. Eso no es un truco: cada servicio
--      declara su capacidad y la base se encarga de que no se pase. La
--      verificación es un trigger diferido con bloqueo por servicio, porque
--      dos reservas simultáneas podrían pasar un chequeo ingenuo las dos.
--
--   2. FOTO DEL PRECIO Y LA DURACIÓN. Un turno guarda cuánto costaba y cuánto
--      duraba el servicio EN EL MOMENTO de agendarlo. Si mañana sube el
--      precio, el turno de ayer no cambia.
--
--   3. NADA SE BORRA. Un turno se cancela, y el cambio queda en el historial
--      con autor y motivo. Borrarlo dejaría la caja sin explicación.
-- ============================================================================

create type public.appointment_status as enum (
  'pending',    -- agendado, falta que la clienta confirme
  'confirmed',  -- confirmado
  'attended',   -- vino y se atendió
  'no_show',    -- no vino y no avisó
  'cancelled'   -- se canceló, con o sin aviso
);

create type public.appointment_source as enum ('staff', 'online', 'import');

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete restrict,

  -- Nulo mientras haya una sola profesional. Cuando sean varias, cada turno
  -- dice de quién es.
  staff_id    uuid references public.profiles (id) on delete set null,

  starts_at   timestamptz not null,
  -- Cuándo termina la atención. Es lo que ve la clienta.
  ends_at     timestamptz not null,
  -- Hasta cuándo queda ocupada la agenda, incluyendo limpieza y preparación.
  -- Nunca se le muestra a nadie de afuera.
  blocks_until timestamptz not null,

  status      public.appointment_status not null default 'pending',
  source      public.appointment_source not null default 'staff',

  -- Suma de los precios de los servicios al momento de agendar.
  price_cents bigint not null default 0,
  notes       text,

  cancelled_at    timestamptz,
  cancel_reason   text,

  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint appointments_ends_after_start check (ends_at > starts_at),
  constraint appointments_blocks_after_end check (blocks_until >= ends_at),
  constraint appointments_price_nonneg check (price_cents >= 0),
  constraint appointments_notes_len check (notes is null or char_length(notes) <= 1000),
  -- Si está cancelado tiene fecha de cancelación, y viceversa.
  constraint appointments_cancel_coherent check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);

-- El índice que sostiene la vista de agenda: los turnos de un día.
create index appointments_tenant_day_idx
  on public.appointments (tenant_id, starts_at);
create index appointments_branch_day_idx
  on public.appointments (branch_id, starts_at);
create index appointments_client_idx
  on public.appointments (client_id, starts_at desc);
create index appointments_staff_day_idx
  on public.appointments (staff_id, starts_at) where staff_id is not null;

comment on table public.appointments is
  'Un turno. Los turnos no se borran: se cancelan, y el cambio queda en '
  'appointment_status_history.';
comment on column public.appointments.blocks_until is
  'ends_at más el tiempo de limpieza del servicio más largo. Ocupa agenda pero '
  'no se cobra ni se le muestra a la clienta.';
comment on column public.appointments.price_cents is
  'Foto del precio al agendar. Si el servicio cambia de precio después, este '
  'turno conserva el que tenía.';

create trigger appointments_touch_updated_at
  before update on public.appointments
  for each row execute function app.touch_updated_at();

create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row execute function app.audit('tenant_id');

-- ---------------------------------------------------------------------------
-- appointment_services
-- ---------------------------------------------------------------------------
create table public.appointment_services (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  -- restrict: un servicio con turnos no se puede borrar. Para dejar de
  -- ofrecerlo está el interruptor de "activo".
  service_id      uuid not null references public.services (id) on delete restrict,

  -- Fotos del momento de agendar.
  duration_minutes integer not null,
  buffer_minutes   integer not null default 0,
  price_cents      bigint,
  position         integer not null default 0,

  constraint appointment_services_duration_range
    check (duration_minutes between 5 and 600),
  constraint appointment_services_buffer_range
    check (buffer_minutes between 0 and 120)
);

create index appointment_services_appointment_idx
  on public.appointment_services (appointment_id, position);
create index appointment_services_service_idx
  on public.appointment_services (service_id);

comment on table public.appointment_services is
  'Qué se hace en el turno. Varios servicios seguidos en un mismo turno son '
  'normales: limpieza de cutis más cejas.';

-- ---------------------------------------------------------------------------
-- appointment_status_history
-- ---------------------------------------------------------------------------
create table public.appointment_status_history (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  from_status     public.appointment_status,
  to_status       public.appointment_status not null,
  reason          text,
  changed_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index appointment_status_history_appointment_idx
  on public.appointment_status_history (appointment_id, created_at);

comment on table public.appointment_status_history is
  'Append-only. De acá sale el índice de ausentismo de cada clienta, que después '
  'decide cuántos recordatorios necesita.';

create or replace function app.record_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.appointment_status_history (
    tenant_id, appointment_id, from_status, to_status, reason, changed_by
  )
  values (
    new.tenant_id,
    new.id,
    case when tg_op = 'UPDATE' then old.status end,
    new.status,
    new.cancel_reason,
    (select auth.uid())
  );

  return new;
end;
$$;

create trigger appointments_record_status
  after insert or update of status on public.appointments
  for each row execute function app.record_appointment_status();

-- ---------------------------------------------------------------------------
-- agenda_blocks · bloquear la agenda
-- ---------------------------------------------------------------------------
create table public.agenda_blocks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete cascade,
  staff_id    uuid references public.profiles (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint agenda_blocks_ends_after_start check (ends_at > starts_at),
  constraint agenda_blocks_reason_len check (reason is null or char_length(reason) <= 200)
);

create index agenda_blocks_tenant_day_idx
  on public.agenda_blocks (tenant_id, starts_at);

comment on table public.agenda_blocks is
  'Ratos en los que no se atiende: vacaciones, un feriado, la tarde del médico. '
  'No impiden agendar a la fuerza, pero la agenda los muestra y la reserva '
  'online los respeta.';

-- ============================================================================
-- Coherencia y cupos
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La ventana del turno tiene que coincidir con lo que se hace en él
-- ---------------------------------------------------------------------------
-- ends_at y blocks_until los calcula la aplicación, que es quien conoce las
-- duraciones al armar el turno. Esto no los recalcula: los VERIFICA. Si alguna
-- vez la aplicación escribe algo incoherente, la transacción falla en vez de
-- dejar un turno que ocupa mal la agenda.
--
-- Va diferido porque cuando se inserta el turno todavía no existen sus
-- servicios: recién al cerrar la transacción están las dos partes.
create or replace function app.check_appointment_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- El mismo trigger corre sobre dos tablas distintas. Leer la fila como JSON
  -- evita preguntar por un campo que en una de las dos no existe: en
  -- `appointments` el turno es `id`, en `appointment_services` es
  -- `appointment_id`. Y sirve igual para DELETE, donde `new` viene en nulo.
  v_row_json    jsonb := to_jsonb(coalesce(new, old));
  v_appointment uuid  := coalesce(
                           (v_row_json ->> 'appointment_id')::uuid,
                           (v_row_json ->> 'id')::uuid
                         );
  v_row         public.appointments;
  v_minutes     integer;
  v_buffer      integer;
begin
  select * into v_row from public.appointments where id = v_appointment;
  if not found then
    -- El turno se borró en esta misma transacción: no hay nada que verificar.
    return null;
  end if;

  select coalesce(sum(duration_minutes), 0), coalesce(max(buffer_minutes), 0)
    into v_minutes, v_buffer
  from public.appointment_services
  where appointment_id = v_appointment;

  if v_minutes = 0 then
    raise exception 'Un turno necesita al menos un servicio.'
      using errcode = '23514';
  end if;

  if v_row.ends_at <> v_row.starts_at + make_interval(mins => v_minutes) then
    raise exception
      'La duración del turno (% min) no coincide con la de sus servicios (% min).',
      extract(epoch from (v_row.ends_at - v_row.starts_at)) / 60, v_minutes
      using errcode = '23514';
  end if;

  if v_row.blocks_until <> v_row.ends_at + make_interval(mins => v_buffer) then
    raise exception 'El tiempo de limpieza del turno no coincide con el del servicio.'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger appointments_check_window
  after insert or update of starts_at, ends_at, blocks_until on public.appointments
  deferrable initially deferred
  for each row execute function app.check_appointment_window();

create constraint trigger appointment_services_check_window
  after insert or update or delete on public.appointment_services
  deferrable initially deferred
  for each row execute function app.check_appointment_window();

-- ---------------------------------------------------------------------------
-- 2. Cupos simultáneos
-- ---------------------------------------------------------------------------
-- Cada servicio declara cuántos turnos suyos pueden correr a la vez. Acá se
-- comprueba que no se pase.
--
-- El bloqueo consultivo por (estética, servicio) no es paranoia: sin él, dos
-- reservas que llegan al mismo tiempo cuentan cada una los turnos que había
-- ANTES de la otra, las dos pasan la verificación, y el cupo queda excedido.
-- El bloqueo se libera solo al cerrar la transacción.
create or replace function app.check_appointment_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Mismo motivo que en check_appointment_window: el trigger cuelga de dos
  -- tablas con nombres de columna distintos para el turno.
  v_row_json    jsonb := to_jsonb(coalesce(new, old));
  v_appointment uuid  := coalesce(
                           (v_row_json ->> 'appointment_id')::uuid,
                           (v_row_json ->> 'id')::uuid
                         );
  v_row         public.appointments;
  r             record;
  v_taken       integer;
begin
  select * into v_row from public.appointments where id = v_appointment;
  if not found then return null; end if;

  -- Lo cancelado y lo que no vino no ocupan lugar.
  if v_row.status in ('cancelled', 'no_show') then return null; end if;

  for r in
    select s.id, s.name, s.capacity
    from public.appointment_services aps
    join public.services s on s.id = aps.service_id
    where aps.appointment_id = v_appointment
  loop
    perform pg_advisory_xact_lock(
      hashtext(v_row.tenant_id::text || ':' || r.id::text)
    );

    select count(distinct a.id) into v_taken
    from public.appointments a
    join public.appointment_services aps on aps.appointment_id = a.id
    where a.tenant_id = v_row.tenant_id
      and a.branch_id = v_row.branch_id
      and aps.service_id = r.id
      and a.id <> v_appointment
      and a.status not in ('cancelled', 'no_show')
      -- Se compara contra blocks_until: el rato de limpieza también ocupa.
      and tstzrange(a.starts_at, a.blocks_until, '[)')
          && tstzrange(v_row.starts_at, v_row.blocks_until, '[)');

    if v_taken >= r.capacity then
      raise exception
        'No hay lugar a esa hora: % %.',
        r.name,
        case
          when r.capacity = 1 then 'se hace de a una persona por vez'
          else format('admite %s a la vez y ya están tomados', r.capacity)
        end
        using errcode = '23P01';
    end if;
  end loop;

  return null;
end;
$$;

create constraint trigger appointments_check_capacity
  after insert or update of starts_at, ends_at, blocks_until, status, branch_id
  on public.appointments
  deferrable initially deferred
  for each row execute function app.check_appointment_capacity();

create constraint trigger appointment_services_check_capacity
  after insert or update on public.appointment_services
  deferrable initially deferred
  for each row execute function app.check_appointment_capacity();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.appointments               enable row level security;
alter table public.appointment_services       enable row level security;
alter table public.appointment_status_history enable row level security;
alter table public.agenda_blocks              enable row level security;

alter table public.appointments               force row level security;
alter table public.appointment_services       force row level security;
alter table public.appointment_status_history force row level security;
alter table public.agenda_blocks              force row level security;

-- Toda la estética trabaja con la agenda: recepción agenda, las profesionales
-- marcan quién vino. Lo que se restringe es borrar.

create policy "appointments: ver los de mis estéticas"
  on public.appointments for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "appointments: agendar en mis estéticas"
  on public.appointments for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );

create policy "appointments: editar en mis estéticas"
  on public.appointments for update to authenticated
  using      ( (select app.has_tenant(tenant_id)) )
  with check ( (select app.has_tenant(tenant_id)) );

-- Borrar un turno deja la caja sin explicación. Para eso está cancelar.
create policy "appointments: borrar sólo owner"
  on public.appointments for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner')) );

create policy "appointment_services: ver"
  on public.appointment_services for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "appointment_services: agregar"
  on public.appointment_services for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );

create policy "appointment_services: quitar"
  on public.appointment_services for delete to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "appointment_status_history: ver"
  on public.appointment_status_history for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "agenda_blocks: ver"
  on public.agenda_blocks for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "agenda_blocks: crear"
  on public.agenda_blocks for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );

create policy "agenda_blocks: borrar"
  on public.agenda_blocks for delete to authenticated
  using ( (select app.has_tenant(tenant_id)) );

revoke all on
  public.appointments, public.appointment_services,
  public.appointment_status_history, public.agenda_blocks
  from anon, authenticated;

grant select, insert, update, delete on public.appointments         to authenticated;
grant select, insert,         delete on public.appointment_services to authenticated;
grant select                         on public.appointment_status_history to authenticated;
grant select, insert,         delete on public.agenda_blocks        to authenticated;

-- ============================================================================
-- Agendar un turno
-- ============================================================================
-- Tiene que ser una función de base de datos y no dos llamadas desde la
-- aplicación: el turno y sus servicios se escriben en tablas distintas, y las
-- verificaciones diferidas corren al cerrar la TRANSACCIÓN. Dos pedidos HTTP
-- son dos transacciones, así que el primero cerraría con un turno sin
-- servicios y fallaría siempre.
--
-- Acá además la duración y el precio se calculan del lado de la base, que es
-- donde viven: la aplicación ya no puede escribir una ventana incoherente.
--
-- SECURITY INVOKER a propósito: corre con los permisos de quien llama, así que
-- la RLS sigue decidiendo en qué estética se puede agendar y con qué servicios.
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
    raise exception 'No encontramos esa ficha de clienta.' using errcode = '42501';
  end if;

  select b.id into v_branch
  from public.branches b
  where b.tenant_id = v_tenant and b.is_default
  limit 1;

  if v_branch is null then
    raise exception 'La estética no tiene una sucursal principal.' using errcode = '23514';
  end if;

  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         coalesce(max(s.buffer_minutes), 0),
         coalesce(sum(s.price_cents), 0)
    into v_found, v_minutes, v_buffer, v_total
  from unnest(p_service_ids) as sel(id)
  join public.services s on s.id = sel.id and s.tenant_id = v_tenant;

  if v_found <> coalesce(array_length(p_service_ids, 1), 0) then
    raise exception 'Alguno de esos servicios no es de esta estética.'
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

comment on function public.book_appointment(uuid, uuid[], timestamptz, text) is
  'Único camino para agendar desde la aplicación: turno y servicios en una '
  'sola transacción, con la duración y el precio calculados por la base.';

revoke all on function public.book_appointment(uuid, uuid[], timestamptz, text) from public;
grant execute on function public.book_appointment(uuid, uuid[], timestamptz, text) to authenticated;
