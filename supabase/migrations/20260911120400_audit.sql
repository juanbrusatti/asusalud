-- ============================================================================
-- Dlay Estética · Bitácora
--
-- Deja registro de quién cambió qué y cuándo en las acciones sensibles. El
-- disparador es genérico y recibe como argumento el nombre de la columna que
-- identifica al tenant, porque en `tenants` es `id` y en el resto `tenant_id`.
-- ============================================================================

create table public.audit_log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  entity      text not null,
  entity_id   text not null,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_tenant_created_idx
  on public.audit_log (tenant_id, created_at desc);
create index audit_log_entity_idx
  on public.audit_log (tenant_id, entity, entity_id);

comment on table public.audit_log is
  'Append-only. Nadie la edita ni la borra desde la aplicación: las filas las '
  'escriben triggers y sólo se leen.';

create or replace function app.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_col text := coalesce(tg_argv[0], 'tenant_id');
  v_row        jsonb := to_jsonb(coalesce(new, old));
  v_tenant     uuid  := (v_row ->> v_tenant_col)::uuid;
begin
  -- Si la estética ya no existe, esto es el borrado en cascada de toda su
  -- información: su bitácora se va con ella y no hay nada que registrar.
  if not exists (select 1 from public.tenants t where t.id = v_tenant) then
    return coalesce(new, old);
  end if;

  insert into public.audit_log (
    tenant_id, actor_id, action, entity, entity_id, before, after
  )
  values (
    v_tenant,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_row ->> 'id',
    case when tg_op in ('update', 'delete') then to_jsonb(old) end,
    case when tg_op in ('insert', 'update') then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

create trigger tenants_audit
  after insert or update or delete on public.tenants
  for each row execute function app.audit('id');

create trigger branches_audit
  after insert or update or delete on public.branches
  for each row execute function app.audit('tenant_id');

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function app.audit('tenant_id');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- Sólo lectura, y sólo para quien manda en la estética. El equipo no necesita
-- ver el historial de cambios de configuración.
create policy "audit_log: leer si owner o admin"
  on public.audit_log for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
