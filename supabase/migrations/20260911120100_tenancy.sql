-- ============================================================================
-- Dlay Estética · Multi-tenant
-- tenants, branches, profiles, memberships.
-- Toda tabla de negocio que venga después lleva tenant_id apuntando acá.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- tenants · una fila por estética
-- ---------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  name        text not null,
  timezone    text not null default 'America/Argentina/Cordoba',
  locale      text not null default 'es-AR',
  currency    text not null default 'ARS',
  status      text not null default 'active'
                check (status in ('active', 'suspended', 'cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tenants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
);

-- El slug es la identidad pública de la estética (dlay.app/asusalud), así que
-- se compara sin distinguir mayúsculas.
create unique index tenants_slug_key on public.tenants (lower(slug));

comment on table public.tenants is
  'Una estética. Raíz del aislamiento: todo dato de negocio cuelga de acá.';
comment on column public.tenants.timezone is
  'Define cuándo "hoy" empieza y termina para esta estética. Los recordatorios '
  'y el cierre de caja se calculan en esta zona, nunca en UTC.';

create trigger tenants_touch_updated_at
  before update on public.tenants
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- branches · sucursales
-- ---------------------------------------------------------------------------
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  address     text,
  phone       text,
  timezone    text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index branches_tenant_id_idx on public.branches (tenant_id);
create unique index branches_tenant_name_key
  on public.branches (tenant_id, lower(name));

-- Exactamente una sucursal por defecto por estética.
create unique index branches_one_default_per_tenant
  on public.branches (tenant_id) where is_default;

comment on table public.branches is
  'Sucursal. Asusalud arranca con una sola, pero la agenda, el stock y la caja '
  'ya cuelgan de acá para que abrir la segunda no sea una migración.';
comment on column public.branches.timezone is
  'Si es NULL hereda la zona de la estética. Sólo se completa cuando una '
  'sucursal está en otra provincia.';

create trigger branches_touch_updated_at
  before update on public.branches
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- profiles · datos de la persona, espejo de auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Datos públicos de un usuario. auth.users no se consulta desde la app: '
  'guarda credenciales y no lleva RLS propia.';

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Alta automática del perfil cuando Supabase Auth crea el usuario.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- memberships · qué persona pertenece a qué estética y con qué rol
-- ---------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.app_role not null default 'staff',
  status      public.membership_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint memberships_tenant_user_key unique (tenant_id, user_id)
);

-- Índice crítico: cada política RLS de cada tabla pasa por acá.
create index memberships_user_active_idx
  on public.memberships (user_id, tenant_id) where status = 'active';
create index memberships_tenant_id_idx on public.memberships (tenant_id);

comment on table public.memberships is
  'Vínculo persona-estética-rol. Es la tabla que gobierna todo el aislamiento: '
  'si una fila no está acá, esa persona no ve nada de esa estética.';

create trigger memberships_touch_updated_at
  before update on public.memberships
  for each row execute function app.touch_updated_at();

-- Una estética nunca puede quedarse sin dueño: ni por borrado ni por cambio
-- de rol. Sin esto, un owner puede dejarse afuera de su propia cuenta.
create or replace function app.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := coalesce(old.tenant_id, new.tenant_id);
  v_owners integer;
begin
  -- Si la estética entera se está borrando, el borrado en cascada de sus
  -- membresías es esperado y no hay nada que proteger. La fila padre ya no
  -- existe cuando corre la cascada, así que alcanza con preguntar por ella.
  if not exists (select 1 from public.tenants t where t.id = v_tenant) then
    return coalesce(new, old);
  end if;

  -- Sólo interesa cuando la fila deja de ser un owner activo.
  if tg_op = 'UPDATE'
     and old.role = 'owner' and old.status = 'active'
     and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  if old.role <> 'owner' or old.status <> 'active' then
    return coalesce(new, old);
  end if;

  select count(*) into v_owners
  from public.memberships
  where tenant_id = v_tenant
    and role = 'owner'
    and status = 'active'
    and id <> old.id;

  if v_owners = 0 then
    raise exception
      'No se puede dejar la estética sin dueño activo. Asigná otro owner primero.'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger memberships_guard_last_owner
  before update or delete on public.memberships
  for each row execute function app.guard_last_owner();
