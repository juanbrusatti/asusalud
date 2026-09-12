-- ============================================================================
-- Dlay Estética · La ficha en el payload del envío
--
-- El adaptador de notificaciones necesita saber a quién le manda para buscar
-- sus suscripciones: una persona puede tener el sistema instalado en el
-- teléfono y en la computadora.
-- ============================================================================

drop function if exists public.rpc_jobs_payload(uuid[]);
drop function if exists app.jobs_payload(uuid[]);

create or replace function app.jobs_payload(p_ids uuid[])
returns table (
  job_id          uuid,
  tenant_id       uuid,
  client_id       uuid,
  channel         public.message_channel,
  test_mode       boolean,
  client_name     text,
  client_email    text,
  client_phone    text,
  template_subject text,
  template_body   text,
  provider_name   text,
  provider_language text,
  quick_replies   text[],
  appointment_id  uuid,
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
    j.client_id,
    j.channel,
    coalesce(ms.test_mode, true),
    trim(c.first_name || ' ' || coalesce(c.last_name, '')),
    c.email,
    c.phone_e164,
    t.subject,
    t.body,
    t.provider_name,
    t.provider_language,
    coalesce(t.quick_replies, '{}'),
    j.appointment_id,
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

create or replace function public.rpc_jobs_payload(p_ids uuid[])
returns table (
  job_id          uuid,
  tenant_id       uuid,
  client_id       uuid,
  channel         public.message_channel,
  test_mode       boolean,
  client_name     text,
  client_email    text,
  client_phone    text,
  template_subject text,
  template_body   text,
  provider_name   text,
  provider_language text,
  quick_replies   text[],
  appointment_id  uuid,
  tenant_name     text,
  tenant_timezone text,
  appointment_at  timestamptz,
  service_names   text,
  phone_number_id text,
  access_token    text
)
language sql
security definer
set search_path = ''
as $$
  select * from app.jobs_payload(p_ids);
$$;

revoke all on function public.rpc_jobs_payload(uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_jobs_payload(uuid[]) to service_role;
