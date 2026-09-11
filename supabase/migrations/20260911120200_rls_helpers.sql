-- ============================================================================
-- Dlay Estética · Helpers de seguridad
--
-- Todas las políticas RLS del sistema pasan por estas cuatro funciones.
-- Son SECURITY DEFINER a propósito: leen memberships saltándose la RLS de esa
-- tabla, que es lo que evita la recursión infinita (la política de memberships
-- necesitaría consultarse a sí misma).
--
-- Se invocan siempre envueltas en (select ...) dentro de las políticas. Eso
-- hace que Postgres las evalúe una vez por sentencia como InitPlan en lugar de
-- una vez por fila, que es la diferencia entre una consulta de 3 ms y una de
-- 300 ms sobre miles de turnos.
-- ============================================================================

-- Estéticas donde el usuario actual tiene una membresía activa.
create or replace function app.tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tenant_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

-- ¿El usuario actual pertenece a esta estética?
create or replace function app.has_tenant(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

-- ¿Con alguno de estos roles?
create or replace function app.has_role(
  p_tenant uuid,
  variadic p_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = p_tenant
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

-- ¿Comparte al menos una estética con este otro usuario? Se usa para que el
-- equipo pueda verse entre sí sin exponer el resto de los perfiles.
create or replace function app.shares_tenant(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = p_user
      and theirs.status = 'active'
  );
$$;

comment on function app.tenant_ids()  is 'Estéticas del usuario actual.';
comment on function app.has_tenant(uuid) is 'Pertenencia a una estética.';
comment on function app.has_role(uuid, public.app_role[]) is 'Pertenencia con rol.';
comment on function app.shares_tenant(uuid) is 'Compañeros de equipo.';

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- El esquema app no se expone por la API, pero `authenticated` necesita poder
-- ejecutar los helpers porque las políticas corren con su rol.
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

revoke all on function app.tenant_ids()                       from public;
revoke all on function app.has_tenant(uuid)                    from public;
revoke all on function app.has_role(uuid, public.app_role[])   from public;
revoke all on function app.shares_tenant(uuid)                 from public;

grant execute on function app.tenant_ids()                      to authenticated, service_role;
grant execute on function app.has_tenant(uuid)                   to authenticated, service_role;
grant execute on function app.has_role(uuid, public.app_role[])  to authenticated, service_role;
grant execute on function app.shares_tenant(uuid)                to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Alta de una estética
-- ---------------------------------------------------------------------------
-- Problema del huevo y la gallina: para insertar en tenants hay que pertenecer
-- a la estética, y para pertenecer tiene que existir. Se resuelve con una
-- función que crea las tres filas en una sola transacción.
create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant public.tenants;
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
  values (v_tenant.id, 'Principal', true);

  return v_tenant;
end;
$$;

comment on function public.create_tenant(text, text) is
  'Crea estética + membresía de dueño + sucursal principal en una transacción. '
  'Único camino para dar de alta un tenant desde la aplicación.';

revoke all on function public.create_tenant(text, text) from public;
grant execute on function public.create_tenant(text, text) to authenticated;
