-- ============================================================================
-- Dlay Estética · Emisor
--
-- Lo que faltaba: alguien que entregue los mensajes que el motor planifica.
--
-- La decisión más importante de esta migración no es técnica sino de
-- seguridad operativa: TODA ESTÉTICA NUEVA ARRANCA EN MODO DE PRUEBA. El
-- sistema hace todo el recorrido —arma el mensaje, elige el canal, lo anota en
-- la bitácora— pero no sale nada hacia afuera. Apagar el modo de prueba es un
-- acto deliberado.
--
-- Sin eso, la primera regla mal configurada le escribe a seis mil personas
-- reales, y de ahí no se vuelve.
-- ============================================================================

alter table public.messaging_settings
  add column test_mode boolean not null default true;

comment on column public.messaging_settings.test_mode is
  'En modo de prueba el emisor arma y registra todo, pero no entrega nada. '
  'Sirve para mirar una semana de recordatorios antes de que lleguen a una '
  'clienta de verdad.';

-- Qué se envió realmente. Guardar el texto renderizado es lo que permite
-- responder "¿qué decía el mensaje que le llegó?" seis meses después.
alter table public.message_jobs
  add column rendered_subject text,
  add column rendered_body    text,
  add column was_test         boolean not null default false;

-- ---------------------------------------------------------------------------
-- whatsapp_accounts · credenciales de cada estética
-- ---------------------------------------------------------------------------
create table public.whatsapp_accounts (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,

  waba_id          text,
  phone_number_id  text not null,
  display_phone    text,

  -- El token nunca sale del servidor. Esta tabla NO tiene ningún GRANT para
  -- `authenticated`: ni siquiera SELECT. Sólo la leen el emisor y el webhook,
  -- que corren con permisos del sistema.
  access_token     text not null,
  -- Lo que Meta devuelve en el handshake del webhook.
  verify_token     text,
  -- Se usa para validar la firma X-Hub-Signature-256 de cada webhook.
  app_secret       text,

  -- Espejo de lo que informa Meta. Es el tablero de salud de la cuenta.
  status           text not null default 'pending'
                     check (status in ('pending','connected','flagged','restricted','disabled')),
  quality_rating   text check (quality_rating in ('GREEN','YELLOW','RED','UNKNOWN')),
  messaging_limit  text,
  last_checked_at  timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.whatsapp_accounts is
  'Credenciales y salud de la cuenta de WhatsApp de cada estética. Sin GRANT '
  'para authenticated a propósito: el token no se expone ni a la dueña.';

create trigger whatsapp_accounts_touch_updated_at
  before update on public.whatsapp_accounts
  for each row execute function app.touch_updated_at();

alter table public.whatsapp_accounts enable row level security;
alter table public.whatsapp_accounts force row level security;
-- Sin políticas y sin grants: nadie que no sea el sistema toca esta tabla.
revoke all on public.whatsapp_accounts from anon, authenticated;

-- Vista sin secretos, para que el panel pueda mostrar el estado de la cuenta.
create or replace view public.whatsapp_status
with (security_invoker = true)
as
  select
    wa.tenant_id,
    wa.display_phone,
    wa.status,
    wa.quality_rating,
    wa.messaging_limit,
    wa.last_checked_at,
    wa.access_token is not null as has_token
  from public.whatsapp_accounts wa
  where (select app.has_tenant(wa.tenant_id));

comment on view public.whatsapp_status is
  'Lo que el panel puede ver de la cuenta de WhatsApp: estado y calidad, nunca '
  'las credenciales.';

grant select on public.whatsapp_status to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que el emisor necesita para armar un mensaje
-- ---------------------------------------------------------------------------
-- Una sola consulta con todo: quién, por dónde, qué texto y con qué
-- credenciales. Evita que el emisor haga cinco viajes por mensaje.
create or replace function app.jobs_payload(p_ids uuid[])
returns table (
  job_id          uuid,
  tenant_id       uuid,
  channel         public.message_channel,
  test_mode       boolean,
  client_name     text,
  client_email    text,
  client_phone    text,
  template_subject text,
  template_body   text,
  provider_name   text,
  provider_language text,
  tenant_name     text,
  tenant_timezone text,
  appointment_at  timestamptz,
  service_names   text,
  phone_number_id text,
  access_token    text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id,
    j.tenant_id,
    j.channel,
    coalesce(ms.test_mode, true),
    trim(c.first_name || ' ' || coalesce(c.last_name, '')),
    c.email,
    c.phone_e164,
    t.subject,
    t.body,
    t.provider_name,
    t.provider_language,
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
    wa.access_token
  from public.message_jobs j
  join public.clients c on c.id = j.client_id
  join public.tenants te on te.id = j.tenant_id
  left join public.messaging_settings ms on ms.tenant_id = j.tenant_id
  left join public.message_templates t on t.id = j.template_id
  left join public.appointments a on a.id = j.appointment_id
  left join public.whatsapp_accounts wa on wa.tenant_id = j.tenant_id
  where j.id = any (p_ids);
$$;

revoke all on function app.jobs_payload(uuid[]) from public;
grant execute on function app.jobs_payload(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- Cerrar un envío
-- ---------------------------------------------------------------------------
-- El emisor no escribe directo en la tabla: pasa por acá. Así el registro de
-- lo enviado, el reintento y el corte quedan en un solo lugar.
create or replace function app.finish_job(
  p_id        uuid,
  p_ok        boolean,
  p_subject   text default null,
  p_body      text default null,
  p_provider_id text default null,
  p_error     text default null,
  p_was_test  boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts from public.message_jobs where id = p_id;

  if p_ok then
    update public.message_jobs
    set status = 'sent',
        sent_at = now(),
        rendered_subject = p_subject,
        rendered_body = p_body,
        provider_message_id = p_provider_id,
        was_test = p_was_test,
        last_error = null
    where id = p_id;
  elsif coalesce(v_attempts, 0) >= 3 then
    -- Tres intentos alcanzan. Insistir más sobre un error que no se arregla
    -- solo es justo lo que degrada la reputación de la cuenta.
    update public.message_jobs
    set status = 'failed', last_error = p_error
    where id = p_id;
  else
    -- Vuelve a la cola con una espera creciente.
    update public.message_jobs
    set status = 'pending',
        last_error = p_error,
        scheduled_for = now() + make_interval(mins => power(4, coalesce(v_attempts, 1))::integer)
    where id = p_id;
  end if;
end;
$$;

revoke all on function app.finish_job(uuid, boolean, text, text, text, text, boolean) from public;
grant execute on function app.finish_job(uuid, boolean, text, text, text, text, boolean) to service_role;
