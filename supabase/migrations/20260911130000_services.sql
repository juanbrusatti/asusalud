-- ============================================================================
-- Dlay Estética · Servicios
--
-- El catálogo de lo que la estética vende. Alimenta la agenda (duración),
-- la reserva online (precio y disponibilidad), la caja (precio) y el motor de
-- recordatorios (filtro por tipo de servicio).
--
-- Tres decisiones que vienen de mirar cómo trabaja Asusalud hoy:
--
--   1. `capacity`: cuántos turnos del mismo servicio pueden correr a la vez.
--      Hoy superponen turnos a mano porque el aparato trabaja solo mientras
--      ellas atienden a otra persona. Acá eso es un número, no un truco.
--   2. `buffer_minutes`: el tiempo de limpieza y preparación entre turnos.
--      Bloquea agenda pero no se le cobra a nadie.
--   3. `price_mode`: un precio vacío es un dato faltante; "a convenir" es una
--      decisión. Confundirlos es lo que rompe los reportes.
-- ============================================================================

create type public.price_mode as enum ('fixed', 'on_request');

-- ---------------------------------------------------------------------------
-- service_categories
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint service_categories_name_len check (char_length(trim(name)) between 1 and 60)
);

create index service_categories_tenant_idx
  on public.service_categories (tenant_id, sort_order, name);
create unique index service_categories_tenant_name_key
  on public.service_categories (tenant_id, lower(name));

comment on table public.service_categories is
  'Agrupa servicios para que un listado de treinta ítems siga siendo legible. '
  'Opcional: un servicio puede no tener categoría.';

create trigger service_categories_touch_updated_at
  before update on public.service_categories
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
create table public.services (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  category_id   uuid references public.service_categories (id) on delete set null,

  name          text not null,
  description   text,

  duration_minutes integer not null default 30,
  buffer_minutes   integer not null default 0,
  capacity         integer not null default 1,

  price_mode    public.price_mode not null default 'fixed',
  -- En centavos y entero: con decimales de punto flotante, sumar mil turnos
  -- termina dando un total que no cierra con la caja.
  price_cents   bigint,

  is_active            boolean not null default true,
  is_bookable_online   boolean not null default true,
  sort_order           integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint services_name_len
    check (char_length(trim(name)) between 1 and 120),
  -- Cinco minutos es el turno más corto imaginable; diez horas, el más largo.
  constraint services_duration_range
    check (duration_minutes between 5 and 600),
  constraint services_buffer_range
    check (buffer_minutes between 0 and 120),
  constraint services_capacity_range
    check (capacity between 1 and 50),
  constraint services_price_nonneg
    check (price_cents is null or price_cents >= 0),
  -- Un precio fijo necesita un número; "a convenir" no admite ninguno.
  constraint services_price_matches_mode check (
    (price_mode = 'fixed'      and price_cents is not null) or
    (price_mode = 'on_request' and price_cents is null)
  )
);

create index services_tenant_active_idx
  on public.services (tenant_id, is_active, sort_order, name);
create index services_category_idx
  on public.services (category_id) where category_id is not null;
-- Dos servicios con el mismo nombre en la misma estética son siempre un error
-- de carga. En TuTurno hay varios y ensucian los reportes.
create unique index services_tenant_name_key
  on public.services (tenant_id, lower(trim(name)));

comment on table public.services is
  'Catálogo de servicios. Los servicios no se borran cuando dejan de ofrecerse: '
  'se desactivan, porque los turnos históricos los siguen referenciando.';
comment on column public.services.capacity is
  'Turnos simultáneos que admite este servicio. Depilación con aparato puede '
  'ser 2 o 3; un masaje es siempre 1.';
comment on column public.services.buffer_minutes is
  'Minutos de limpieza y preparación después del turno. Ocupan agenda pero no '
  'se cobran ni se le muestran al cliente.';
comment on column public.services.is_bookable_online is
  'Separado de is_active a propósito: hay servicios que se ofrecen pero que la '
  'estética prefiere agendar hablando, como una primera consulta.';

create trigger services_touch_updated_at
  before update on public.services
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- service_price_history
-- ---------------------------------------------------------------------------
-- Con la inflación argentina los precios se actualizan seguido. Sin historial,
-- un turno de hace tres meses se valúa al precio de hoy y el reporte miente.
create table public.service_price_history (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  service_id  uuid not null references public.services (id) on delete cascade,
  price_cents bigint,
  price_mode  public.price_mode not null,
  valid_from  timestamptz not null default now(),
  changed_by  uuid references auth.users (id) on delete set null
);

create index service_price_history_service_idx
  on public.service_price_history (service_id, valid_from desc);

comment on table public.service_price_history is
  'Append-only. La escribe un trigger cada vez que cambia el precio.';

create or replace function app.record_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.price_cents is not distinct from old.price_cents
     and new.price_mode  is not distinct from old.price_mode then
    return new;
  end if;

  insert into public.service_price_history (
    tenant_id, service_id, price_cents, price_mode, changed_by
  )
  values (
    new.tenant_id, new.id, new.price_cents, new.price_mode, (select auth.uid())
  );

  return new;
end;
$$;

create trigger services_record_price_change
  after insert or update of price_cents, price_mode on public.services
  for each row execute function app.record_price_change();

create trigger services_audit
  after insert or update or delete on public.services
  for each row execute function app.audit('tenant_id');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.service_categories     enable row level security;
alter table public.services               enable row level security;
alter table public.service_price_history  enable row level security;

alter table public.service_categories     force row level security;
alter table public.services               force row level security;
alter table public.service_price_history  force row level security;

-- Todo el equipo necesita ver el catálogo: sin precios ni duraciones no se
-- puede agendar. Modificarlo es cosa de quien manda.

create policy "service_categories: ver las de mis estéticas"
  on public.service_categories for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "service_categories: crear si owner o admin"
  on public.service_categories for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "service_categories: editar si owner o admin"
  on public.service_categories for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "service_categories: borrar si owner o admin"
  on public.service_categories for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "services: ver los de mis estéticas"
  on public.services for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "services: crear si owner o admin"
  on public.services for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "services: editar si owner o admin"
  on public.services for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "services: borrar si owner o admin"
  on public.services for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

-- El historial de precios es información comercial: sólo owner y admin.
create policy "service_price_history: leer si owner o admin"
  on public.service_price_history for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.service_categories, public.services, public.service_price_history
  from anon, authenticated;

grant select, insert, update, delete on public.service_categories to authenticated;
grant select, insert, update, delete on public.services           to authenticated;
grant select                         on public.service_price_history to authenticated;
