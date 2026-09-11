-- ============================================================================
-- Dlay Estética · Políticas RLS
--
-- Regla del proyecto: ninguna tabla en `public` sale de una migración sin RLS
-- habilitada y con políticas explícitas. Una tabla sin política es una fuga.
--
-- `anon` no recibe ningún permiso. La reserva pública, cuando llegue, va a
-- hablar con funciones SECURITY DEFINER que devuelven sólo disponibilidad,
-- nunca con estas tablas.
-- ============================================================================

alter table public.tenants     enable row level security;
alter table public.branches    enable row level security;
alter table public.profiles    enable row level security;
alter table public.memberships enable row level security;

-- Forzar RLS también para el dueño de las tablas: sin esto, cualquier conexión
-- que corra como postgres se saltea todo sin darse cuenta.
alter table public.tenants     force row level security;
alter table public.branches    force row level security;
alter table public.profiles    force row level security;
alter table public.memberships force row level security;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
-- No hay política de INSERT: el alta pasa sí o sí por public.create_tenant().
-- Tampoco de DELETE: borrar una estética se hace desde el backoffice con
-- service_role, nunca desde la app.

create policy "tenants: ver las propias"
  on public.tenants for select to authenticated
  using ( (select app.has_tenant(id)) );

create policy "tenants: editar si owner o admin"
  on public.tenants for update to authenticated
  using      ( (select app.has_role(id, 'owner', 'admin')) )
  with check ( (select app.has_role(id, 'owner', 'admin')) );

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
create policy "branches: ver las de mis estéticas"
  on public.branches for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "branches: crear si owner o admin"
  on public.branches for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "branches: editar si owner o admin"
  on public.branches for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "branches: borrar si owner"
  on public.branches for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner')) );

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: ver el propio y el de mis compañeros"
  on public.profiles for select to authenticated
  using ( id = (select auth.uid()) or (select app.shares_tenant(id)) );

create policy "profiles: editar sólo el propio"
  on public.profiles for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
-- Quién trabaja en la estética lo ve todo el equipo; quién entra y con qué rol
-- lo deciden sólo owner y admin.

create policy "memberships: ver las de mis estéticas"
  on public.memberships for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "memberships: invitar si owner o admin"
  on public.memberships for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "memberships: editar si owner o admin"
  on public.memberships for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "memberships: quitar si owner o admin"
  on public.memberships for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

-- Un admin no puede fabricarse un owner ni ascender a nadie a owner: eso lo
-- decide únicamente quien ya es dueño. La política RLS no alcanza para
-- expresarlo porque necesita comparar el rol viejo con el nuevo.
create or replace function app.guard_owner_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_owner boolean;
begin
  -- Sólo interesan las filas que terminan siendo owner.
  if new.role <> 'owner' then
    return new;
  end if;

  -- Ya era owner: no hay escalada, es una edición cualquiera.
  if tg_op = 'UPDATE' and old.role = 'owner' then
    return new;
  end if;

  select exists (
    select 1
    from public.memberships m
    where m.tenant_id = new.tenant_id
      and m.role = 'owner'
      and m.status = 'active'
      and m.id <> new.id
  ) into v_has_owner;

  -- Alta de la estética: esta fila es el primer dueño y todavía no hay nadie
  -- que pueda autorizarla. Es el único camino que llega hasta acá sin owner,
  -- porque create_tenant corre como SECURITY DEFINER; cualquier otro INSERT
  -- ya fue filtrado antes por la política RLS de memberships.
  if not v_has_owner then
    return new;
  end if;

  if not (select app.has_role(new.tenant_id, 'owner')) then
    raise exception 'Sólo un dueño puede designar a otro dueño.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger memberships_guard_owner_escalation
  before insert or update on public.memberships
  for each row execute function app.guard_owner_escalation();

-- ---------------------------------------------------------------------------
-- Permisos de tabla
-- ---------------------------------------------------------------------------
-- RLS filtra filas, GRANT decide si la tabla es visible. Hacen falta los dos.
revoke all on public.tenants, public.branches, public.profiles, public.memberships
  from anon, authenticated;

grant select, update                 on public.tenants     to authenticated;
grant select, insert, update, delete on public.branches    to authenticated;
grant select, update                 on public.profiles    to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;

-- Nada para `anon`, ni siquiera SELECT.
