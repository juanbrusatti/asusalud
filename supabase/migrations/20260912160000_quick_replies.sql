-- ============================================================================
-- Dlay Estética · Botones de respuesta rápida
--
-- Una plantilla de WhatsApp puede llevar botones. Cuando la clienta toca uno,
-- Meta nos devuelve su "payload", y eso es lo que convierte un recordatorio en
-- autogestión: confirmar el turno deja de ser un mensaje que alguien tiene que
-- leer y ejecutar a mano.
--
-- Los botones se declaran en Meta al aprobar la plantilla. Acá sólo se guarda
-- QUÉ hace cada uno y en qué orden, porque el payload lo mandamos nosotros en
-- cada envío con el identificador del turno adentro.
-- ============================================================================

alter table public.message_templates
  add column quick_replies text[] not null default '{}';

comment on column public.message_templates.quick_replies is
  'Acciones de los botones, en el mismo orden en que están cargados en Meta. '
  'Valores admitidos: confirmar, reprogramar, baja.';

alter table public.message_templates
  add constraint message_templates_quick_replies_valid check (
    quick_replies <@ array['confirmar', 'reprogramar', 'baja']::text[]
  );

-- Los botones sólo tienen sentido en WhatsApp: el correo no los tiene.
alter table public.message_templates
  add constraint message_templates_quick_replies_channel check (
    channel = 'whatsapp' or cardinality(quick_replies) = 0
  );

-- El emisor necesita saber qué botones mandar y con qué turno adentro.
--
-- Se borran primero: `create or replace` no puede cambiar las columnas que
-- devuelve una función, y acá se agregan dos. El envoltorio depende de la otra,
-- así que va en ese orden.
drop function if exists public.rpc_jobs_payload(uuid[]);
drop function if exists app.jobs_payload(uuid[]);

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
