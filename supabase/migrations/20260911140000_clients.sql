-- ============================================================================
-- Dlay Estética · Clientes
--
-- La agenda de personas de la estética. Asusalud tiene 6.509 en el sistema
-- anterior, así que dos cosas mandan en el diseño: que buscar sea instantáneo
-- y que los datos de contacto estén limpios.
--
-- Tres decisiones que conviene entender antes de leer el esquema:
--
--   1. El teléfono se guarda normalizado (formato internacional) Y tal como lo
--      escribieron. Lo primero sirve para mandar mensajes; lo segundo, para
--      que nadie sienta que el sistema le "arruinó" el dato.
--   2. El teléfono NO es único. En una estética la madre saca turno para la
--      hija con su propio número, y una restricción dura haría fallar la
--      importación de datos reales. Los repetidos se muestran, no se prohíben.
--   3. Las métricas históricas del sistema anterior (cuánto gastó, cuántos
--      turnos hizo, cuándo vino por última vez) se guardan aparte, en campos
--      `legacy_*`. Así se conserva el perfil de cada clienta sin migrar veinte
--      mil turnos viejos.
-- ============================================================================

create extension if not exists "pg_trgm"  with schema extensions;
create extension if not exists "unaccent" with schema extensions;

-- Cómo se le avisa a esta persona. 'auto' deja decidir a la cascada de canales
-- (push → email → WhatsApp); el resto es una decisión humana que el sistema
-- respeta.
create type public.channel_mode as enum ('auto', 'email', 'whatsapp', 'none');

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,

  first_name  text not null,
  last_name   text,

  -- Formato internacional (+5493584123456). Es lo que se usa para enviar.
  phone_e164  text,
  -- Lo que la persona escribió, sin tocar.
  phone_raw   text,
  email       text,
  document_id text,
  birthdate   date,

  -- Siempre visible en la ficha: alergias, condiciones, advertencias.
  alert       text,

  channel_mode        public.channel_mode not null default 'auto',
  channel_decided_by  uuid references auth.users (id) on delete set null,
  channel_decided_at  timestamptz,

  -- Historial traído del sistema anterior. Se separa de lo que calculemos
  -- nosotros para que nunca se confundan un dato importado y uno propio.
  legacy_source         text,
  legacy_visits_count   integer,
  legacy_total_cents    bigint,
  legacy_last_visit_on  date,

  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint clients_first_name_len
    check (char_length(trim(first_name)) between 1 and 80),
  constraint clients_last_name_len
    check (last_name is null or char_length(trim(last_name)) <= 80),
  -- Formato internacional estricto: si no entra acá, se guarda sólo el crudo
  -- y la ficha queda marcada para revisar.
  constraint clients_phone_e164_format
    check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint clients_email_format
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint clients_legacy_nonneg
    check (
      (legacy_visits_count is null or legacy_visits_count >= 0) and
      (legacy_total_cents  is null or legacy_total_cents  >= 0)
    )
);

comment on table public.clients is
  'Personas que atiende la estética. El teléfono no es único a propósito: '
  'los repetidos se señalan en la interfaz, no se prohíben.';
comment on column public.clients.alert is
  'Aviso corto que se muestra siempre en la ficha y al agendar: alergias, '
  'embarazo, medicación. No es una nota más.';
comment on column public.clients.channel_mode is
  'auto: decide la cascada de canales. email/whatsapp: decisión humana que el '
  'sistema respeta. none: no recibe recordatorios automáticos.';

-- `unaccent` es STABLE, no IMMUTABLE, porque depende de un diccionario que en
-- teoría puede cambiar. Una columna generada exige inmutabilidad, así que se
-- usa el envoltorio habitual: fija el diccionario y por lo tanto el resultado.
create or replace function app.immutable_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

-- Texto de búsqueda: nombre, apellido, teléfono y correo en una sola columna,
-- sin acentos y en minúsculas. Con 6.509 personas, escribir dos letras tiene
-- que alcanzar para llegar.
alter table public.clients
  add column search_text text
  generated always as (
    app.immutable_unaccent(
      lower(
        coalesce(first_name, '') || ' ' ||
        coalesce(last_name, '')  || ' ' ||
        coalesce(phone_e164, '') || ' ' ||
        coalesce(phone_raw, '')  || ' ' ||
        coalesce(email, '')
      )
    )
  ) stored;

create index clients_search_idx
  on public.clients using gin (search_text extensions.gin_trgm_ops);
create index clients_tenant_name_idx
  on public.clients (tenant_id, last_name, first_name);
create index clients_tenant_phone_idx
  on public.clients (tenant_id, phone_e164) where phone_e164 is not null;
create index clients_tenant_email_idx
  on public.clients (tenant_id, lower(email)) where email is not null;

create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function app.touch_updated_at();

-- Quién eligió el canal y cuándo. Una decisión humana no la pisa nadie sin
-- dejar rastro.
create or replace function app.stamp_channel_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.channel_mode <> 'auto' then
      new.channel_decided_by := (select auth.uid());
      new.channel_decided_at := now();
    end if;
  elsif new.channel_mode is distinct from old.channel_mode then
    if new.channel_mode = 'auto' then
      new.channel_decided_by := null;
      new.channel_decided_at := null;
    else
      new.channel_decided_by := (select auth.uid());
      new.channel_decided_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger clients_stamp_channel_decision
  before insert or update on public.clients
  for each row execute function app.stamp_channel_decision();

-- ---------------------------------------------------------------------------
-- client_tags · etiquetas
-- ---------------------------------------------------------------------------
create table public.client_tags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint client_tags_name_len check (char_length(trim(name)) between 1 and 40)
);

create unique index client_tags_tenant_name_key
  on public.client_tags (tenant_id, lower(name));

comment on table public.client_tags is
  'Etiquetas libres: "VIP", "solo tardes", "no quiere promociones". Después '
  'se usan para segmentar a quién le llega cada recordatorio.';

create trigger client_tags_touch_updated_at
  before update on public.client_tags
  for each row execute function app.touch_updated_at();

create table public.client_tag_assignments (
  client_id  uuid not null references public.clients (id) on delete cascade,
  tag_id     uuid not null references public.client_tags (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (client_id, tag_id)
);

create index client_tag_assignments_tag_idx
  on public.client_tag_assignments (tag_id);
create index client_tag_assignments_tenant_idx
  on public.client_tag_assignments (tenant_id);

-- ---------------------------------------------------------------------------
-- client_notes · seguimiento
-- ---------------------------------------------------------------------------
create table public.client_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  body        text not null,
  -- Apunta a profiles y no a auth.users para que la API pueda traer el nombre
  -- del autor junto con la nota. profiles.id ya referencia a auth.users.
  author_id   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint client_notes_body_len check (char_length(trim(body)) between 1 and 2000)
);

create index client_notes_client_idx
  on public.client_notes (client_id, created_at desc);

comment on table public.client_notes is
  'Seguimiento en el tiempo: cómo respondió la piel, qué producto se usó, qué '
  'quedó pendiente. Se suman, no se pisan.';

-- ---------------------------------------------------------------------------
-- Duplicados por teléfono
-- ---------------------------------------------------------------------------
-- No se prohíben, se muestran. Devuelve cuántas OTRAS personas comparten el
-- teléfono de esta, para poder avisarlo en la ficha.
create or replace function public.count_phone_duplicates(p_client uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.clients others
  join public.clients self
    on self.id = p_client
   and others.tenant_id = self.tenant_id
   and others.phone_e164 = self.phone_e164
  where others.id <> p_client
    and self.phone_e164 is not null;
$$;

revoke all on function public.count_phone_duplicates(uuid) from public;
grant execute on function public.count_phone_duplicates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoría y RLS
-- ---------------------------------------------------------------------------
create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function app.audit('tenant_id');

alter table public.clients                enable row level security;
alter table public.client_tags            enable row level security;
alter table public.client_tag_assignments enable row level security;
alter table public.client_notes           enable row level security;

alter table public.clients                force row level security;
alter table public.client_tags            force row level security;
alter table public.client_tag_assignments force row level security;
alter table public.client_notes           force row level security;

-- Todo el equipo trabaja con clientes: recepción agenda, las profesionales
-- anotan cómo fue la sesión. Por eso acá escriben los cuatro roles, a
-- diferencia del catálogo de servicios.

create policy "clients: ver los de mis estéticas"
  on public.clients for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "clients: crear en mis estéticas"
  on public.clients for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );

create policy "clients: editar en mis estéticas"
  on public.clients for update to authenticated
  using      ( (select app.has_tenant(tenant_id)) )
  with check ( (select app.has_tenant(tenant_id)) );

-- Borrar una ficha borra su historial: sólo owner y admin.
create policy "clients: borrar si owner o admin"
  on public.clients for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "client_tags: ver"
  on public.client_tags for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "client_tags: crear"
  on public.client_tags for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );

create policy "client_tags: editar si owner o admin"
  on public.client_tags for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "client_tags: borrar si owner o admin"
  on public.client_tags for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "client_tag_assignments: ver"
  on public.client_tag_assignments for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "client_tag_assignments: asignar"
  on public.client_tag_assignments for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );

create policy "client_tag_assignments: quitar"
  on public.client_tag_assignments for delete to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "client_notes: ver"
  on public.client_notes for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

create policy "client_notes: escribir"
  on public.client_notes for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );

-- Una nota es un registro de lo que pasó: no se edita. Se corrige agregando
-- otra. Borrarla es cosa de owner o admin.
create policy "client_notes: borrar si owner o admin"
  on public.client_notes for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on
  public.clients, public.client_tags,
  public.client_tag_assignments, public.client_notes
  from anon, authenticated;

grant select, insert, update, delete on public.clients                to authenticated;
grant select, insert, update, delete on public.client_tags            to authenticated;
grant select, insert,         delete on public.client_tag_assignments to authenticated;
grant select, insert,         delete on public.client_notes           to authenticated;
