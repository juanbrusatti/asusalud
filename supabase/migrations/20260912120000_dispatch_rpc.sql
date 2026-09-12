-- ============================================================================
-- Dlay Estética · Puerta de entrada del emisor
--
-- El esquema `app` no se expone por la API a propósito: ahí viven los helpers
-- de seguridad y no tienen por qué ser alcanzables desde afuera.
--
-- Pero el emisor corre como Edge Function y habla por la API. Así que se
-- publican tres envoltorios mínimos en `public`, con permiso EXCLUSIVO para
-- `service_role`. `authenticated` y `anon` no los pueden ni ver.
-- ============================================================================

create or replace function public.rpc_claim_due_jobs(p_limit integer default 20)
returns setof public.message_jobs
language sql
security definer
set search_path = ''
as $$
  select * from app.claim_due_jobs(p_limit);
$$;

create or replace function public.rpc_jobs_payload(p_ids uuid[])
returns setof record
language sql
security definer
set search_path = ''
as $$
  select * from app.jobs_payload(p_ids);
$$;

-- `returns setof record` obliga a que quien llame declare las columnas, lo que
-- desde la API es incómodo. Se define con el tipo completo.
drop function if exists public.rpc_jobs_payload(uuid[]);

create or replace function public.rpc_jobs_payload(p_ids uuid[])
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
security definer
set search_path = ''
as $$
  select * from app.jobs_payload(p_ids);
$$;

create or replace function public.rpc_finish_job(
  p_id          uuid,
  p_ok          boolean,
  p_subject     text default null,
  p_body        text default null,
  p_provider_id text default null,
  p_error       text default null,
  p_was_test    boolean default false
)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.finish_job(p_id, p_ok, p_subject, p_body, p_provider_id, p_error, p_was_test);
$$;

revoke all on function public.rpc_claim_due_jobs(integer) from public, anon, authenticated;
revoke all on function public.rpc_jobs_payload(uuid[])    from public, anon, authenticated;
revoke all on function public.rpc_finish_job(uuid, boolean, text, text, text, text, boolean)
  from public, anon, authenticated;

grant execute on function public.rpc_claim_due_jobs(integer) to service_role;
grant execute on function public.rpc_jobs_payload(uuid[])    to service_role;
grant execute on function public.rpc_finish_job(uuid, boolean, text, text, text, text, boolean)
  to service_role;
