-- ============================================================================
-- Dlay Agenda · Recuperar la contraseña, y sumar gente al equipo
--
-- Dos huecos que se notan recién cuando el sistema lo usa un negocio de
-- verdad, y que hasta ahora no tenían salida.
--
-- **La contraseña.** No se puede mostrar: lo que guarda Supabase es un hash de
-- una vía y el texto original no existe en ningún lado. Lo que sí se puede es
-- generar un enlace de un solo uso para que la persona ponga una nueva. De eso
-- se encarga la aplicación; acá abajo sólo está la puerta para saber a qué
-- correo pertenece cada negocio, que es lo único que hace falta y que no se
-- puede consultar desde el navegador.
--
-- **El equipo.** Los cuatro roles existían desde el primer día y la RLS los
-- respeta en todas las tablas, pero no había forma de dar de alta a una
-- segunda persona: toda membresía nacía dentro de `create_tenant`, que te hace
-- titular de un negocio nuevo. O sea que una empleada que se registraba se
-- creaba su propia estética vacía.
--
-- La invitación es un enlace y no un correo, a propósito: esta gente se manda
-- todo por WhatsApp, y un correo más es un correo que no llega.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A quién pertenece un negocio
-- ---------------------------------------------------------------------------
-- `auth.users` no se consulta desde el navegador ni con la clave de servicio
-- vía PostgREST. Esta función es la única forma de saber a qué correo mandarle
-- el enlace, y sólo la puede llamar el servidor.
create or replace function public.rpc_tenant_owner(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  select jsonb_build_object(
    'user_id', u.id,
    'correo',  u.email,
    'nombre',  p.full_name
  )
  into v_out
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.tenant_id = p_tenant
    and m.status = 'active'
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    m.created_at
  limit 1;

  return v_out;
end;
$$;

revoke all on function public.rpc_tenant_owner(uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_tenant_owner(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Las invitaciones
-- ---------------------------------------------------------------------------
create table public.invitations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,

  -- Con qué rol entra. No se puede invitar a alguien como titular: el titular
  -- es quien creó el negocio, y que haya dos es una discusión sobre quién
  -- puede echar a quién.
  role       public.app_role not null default 'staff'
               check (role in ('admin', 'staff', 'reception')),

  -- La llave del enlace. Es lo único que hace falta para entrar, así que se
  -- genera larga y al azar.
  token      text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),

  -- Opcional y sólo informativo: sirve para que en la lista se lea «invitaste
  -- a Ana» en vez de un enlace suelto. No se comprueba contra nada.
  label      text,

  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  used_by    uuid references auth.users (id) on delete set null,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint invitations_label_len check (label is null or char_length(label) <= 80)
);

comment on table public.invitations is
  'Un enlace para sumar a alguien al equipo. Se manda por donde sea —WhatsApp, '
  'casi siempre— y sirve una sola vez.';

create index invitations_tenant_idx on public.invitations (tenant_id, created_at desc);

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

-- Quien dirige el negocio ve y revoca las suyas. Crearlas pasa por la función,
-- que es la que decide qué roles se pueden repartir.
create policy "invitations: ver las propias"
  on public.invitations for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "invitations: revocar"
  on public.invitations for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.invitations from anon, authenticated;
grant select, delete on public.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Crear una invitación
-- ---------------------------------------------------------------------------
create or replace function public.team_invite(
  p_role  public.app_role,
  p_label text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_token  text;
begin
  select t.id into v_tenant
  from public.tenants t
  where (select app.has_role(t.id, 'owner', 'admin'))
  limit 1;

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos tu negocio.');
  end if;

  if p_role not in ('admin', 'staff', 'reception') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese rol no se puede invitar.'
    );
  end if;

  -- Un tope flojo, para que un enlace filtrado no se convierta en una fábrica
  -- de invitaciones. Diez sin usar es más de lo que necesita ningún negocio.
  if (
    select count(*) from public.invitations i
    where i.tenant_id = v_tenant
      and i.used_at is null
      and i.expires_at > now()
  ) >= 10 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya hay diez invitaciones sin usar. Cancelá alguna antes.'
    );
  end if;

  insert into public.invitations (tenant_id, role, label, created_by)
  values (v_tenant, p_role, nullif(btrim(p_label), ''), (select auth.uid()))
  returning token into v_token;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

revoke all on function public.team_invite(public.app_role, text)
  from public, anon;
grant execute on function public.team_invite(public.app_role, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Aceptarla
-- ---------------------------------------------------------------------------
-- La llama quien ya tiene sesión. Si el enlace sirve, queda adentro.
create or replace function public.team_join(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  i      record;
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'Entrá a tu cuenta primero.');
  end if;

  select * into i
  from public.invitations
  where token = btrim(p_token);

  if i.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ese enlace no sirve.');
  end if;

  if i.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Ese enlace ya se usó.');
  end if;

  if i.expires_at <= now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese enlace venció. Pedile uno nuevo a quien te invitó.'
    );
  end if;

  if exists (
    select 1 from public.memberships m
    where m.tenant_id = i.tenant_id and m.user_id = v_user
  ) then
    -- No se quema la invitación: el enlace no era para esta persona.
    return jsonb_build_object(
      'ok', true, 'ya_estaba', true,
      'tenant_id', i.tenant_id
    );
  end if;

  insert into public.memberships (tenant_id, user_id, role, status)
  values (i.tenant_id, v_user, i.role, 'active');

  update public.invitations
  set used_at = now(), used_by = v_user
  where id = i.id;

  return jsonb_build_object('ok', true, 'tenant_id', i.tenant_id);
end;
$$;

revoke all on function public.team_join(text) from public, anon;
grant execute on function public.team_join(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ver el equipo, y sacar a alguien
-- ---------------------------------------------------------------------------
create or replace function public.team_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_out    jsonb;
begin
  select t.id into v_tenant
  from public.tenants t
  where (select app.has_role(t.id, 'owner', 'admin'))
  limit 1;

  if v_tenant is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', m.user_id,
      'nombre',  coalesce(p.full_name, u.email),
      'correo',  u.email,
      'rol',     m.role,
      'desde',   m.created_at,
      'soy_yo',  m.user_id = (select auth.uid())
    )
    order by
      case m.role when 'owner' then 0 when 'admin' then 1
                  when 'reception' then 2 else 3 end,
      m.created_at
  ), '[]'::jsonb)
  into v_out
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.tenant_id = v_tenant
    and m.status = 'active';

  return v_out;
end;
$$;

revoke all on function public.team_members() from public, anon;
grant execute on function public.team_members() to authenticated;

create or replace function public.team_remove(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_rol    public.app_role;
begin
  select t.id into v_tenant
  from public.tenants t
  where (select app.has_role(t.id, 'owner', 'admin'))
  limit 1;

  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'No encontramos tu negocio.');
  end if;

  if p_user = (select auth.uid()) then
    return jsonb_build_object(
      'ok', false,
      'error', 'No te podés sacar a vos misma.'
    );
  end if;

  select m.role into v_rol
  from public.memberships m
  where m.tenant_id = v_tenant and m.user_id = p_user;

  if v_rol is null then
    return jsonb_build_object('ok', false, 'error', 'Esa persona no está en tu equipo.');
  end if;

  -- Al titular no lo saca nadie: es quien responde por la cuenta.
  if v_rol = 'owner' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Al titular del negocio no se lo puede sacar.'
    );
  end if;

  delete from public.memberships
  where tenant_id = v_tenant and user_id = p_user;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.team_remove(uuid) from public, anon;
grant execute on function public.team_remove(uuid) to authenticated;
