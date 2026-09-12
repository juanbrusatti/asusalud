-- ============================================================================
-- Dlay Estética · Horarios y ajustes de la reserva online
--
-- Los horarios de atención no existían hasta ahora a propósito: no había quién
-- los consumiera. La reserva online sí los necesita, porque sin saber cuándo
-- se atiende no se puede calcular un solo horario disponible.
-- ============================================================================

create table public.business_hours (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  branch_id  uuid not null references public.branches (id) on delete cascade,
  -- 0 es domingo, como en Postgres.
  weekday    smallint not null check (weekday between 0 and 6),
  opens_at   time not null,
  closes_at  time not null,
  created_at timestamptz not null default now(),

  constraint business_hours_order check (closes_at > opens_at)
);

create index business_hours_branch_idx
  on public.business_hours (branch_id, weekday);

comment on table public.business_hours is
  'Cuándo se atiende. Varias filas por día permiten cortar al mediodía: una '
  'franja de 9 a 13 y otra de 16 a 20.';

-- ---------------------------------------------------------------------------
-- booking_settings · cómo se comporta la reserva online
-- ---------------------------------------------------------------------------
create table public.booking_settings (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,

  enabled          boolean not null default false,

  -- Cuántas horas antes, como mínimo, se puede reservar. Evita que alguien
  -- saque turno para dentro de diez minutos.
  min_advance_hours integer not null default 2,
  -- Hasta cuándo se puede reservar hacia adelante.
  max_days_ahead    integer not null default 60,
  -- Cada cuántos minutos se ofrece un horario: 15 da "9:00, 9:15, 9:30…".
  slot_minutes      integer not null default 15,

  show_prices       boolean not null default true,
  -- Cuántos turnos a futuro puede tener una misma persona. Es el freno contra
  -- alguien que reserva media agenda.
  max_open_per_client integer not null default 3,

  welcome_text      text,
  address_note      text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint booking_settings_advance check (min_advance_hours between 0 and 720),
  constraint booking_settings_horizon check (max_days_ahead between 1 and 365),
  constraint booking_settings_slots check (slot_minutes in (5, 10, 15, 20, 30, 60)),
  constraint booking_settings_open check (max_open_per_client between 1 and 20)
);

comment on table public.booking_settings is
  'Reglas de la reserva pública. Nace apagada: abrir la agenda al público es '
  'una decisión, no un estado por defecto.';

create trigger booking_settings_touch_updated_at
  before update on public.booking_settings
  for each row execute function app.touch_updated_at();

-- Toda estética nueva nace con horarios de lunes a viernes y sus ajustes.
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
    raise exception 'Hace falta estar autenticado para crear una estética.'
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.business_hours    enable row level security;
alter table public.booking_settings  enable row level security;
alter table public.business_hours    force row level security;
alter table public.booking_settings  force row level security;

create policy "business_hours: ver"
  on public.business_hours for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "business_hours: editar si owner o admin"
  on public.business_hours for all to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "booking_settings: ver"
  on public.booking_settings for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "booking_settings: editar si owner o admin"
  on public.booking_settings for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.business_hours, public.booking_settings from anon, authenticated;
grant select, insert, update, delete on public.business_hours   to authenticated;
grant select,                update         on public.booking_settings to authenticated;
