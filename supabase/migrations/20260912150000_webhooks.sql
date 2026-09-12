-- ============================================================================
-- Dlay Estética · Webhooks de Meta
--
-- Cierra el circuito. Hasta acá sabíamos que un mensaje SALIÓ; ahora sabemos
-- si llegó, si lo leyeron y qué contestaron.
--
-- Eso importa por tres razones, en orden de gravedad:
--
--   1. LA CUENTA. Meta mide la reacción de la gente. Si demasiadas personas
--      bloquean o reportan, la calidad cae y la cuenta termina limitada. La
--      tasa de lectura es la señal temprana, y sin webhooks no existe.
--   2. LAS BAJAS. Alguien que contesta "no me escriban más" tiene que dejar de
--      recibir ese mismo minuto. Una baja ignorada no es un error de producto:
--      es una denuncia.
--   3. LA AUTOGESTIÓN. Una clienta que confirma su turno desde el propio
--      mensaje es un mensaje menos que alguien tiene que leer y ejecutar a
--      mano. Es el ahorro de tiempo que el producto promete.
-- ============================================================================

alter table public.message_jobs
  add column delivered_at timestamptz,
  add column read_at      timestamptz;

comment on column public.message_jobs.read_at is
  'Cuándo lo leyeron. De acá sale la tasa de lectura, que es la señal temprana '
  'de que un texto está molestando antes de que Meta castigue la cuenta.';

create index message_jobs_provider_id_idx
  on public.message_jobs (provider_message_id)
  where provider_message_id is not null;

-- ---------------------------------------------------------------------------
-- whatsapp_inbound · lo que contestan
-- ---------------------------------------------------------------------------
create table public.whatsapp_inbound (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete set null,

  wa_message_id text not null,
  from_phone    text not null,
  kind          text not null,
  body          text,
  -- Lo que viaja en un botón de respuesta rápida: "confirmar:<id del turno>".
  payload       text,

  -- Qué hizo el sistema con esto. Null significa que no había nada que hacer.
  action_taken  text,

  received_at   timestamptz not null default now()
);

create unique index whatsapp_inbound_message_key
  on public.whatsapp_inbound (wa_message_id);
create index whatsapp_inbound_tenant_idx
  on public.whatsapp_inbound (tenant_id, received_at desc);
create index whatsapp_inbound_client_idx
  on public.whatsapp_inbound (client_id, received_at desc)
  where client_id is not null;

comment on table public.whatsapp_inbound is
  'Respuestas de las clientas. El índice único sobre wa_message_id es lo que '
  'hace que reprocesar un webhook repetido no vuelva a ejecutar la acción: '
  'Meta reintenta cuando no recibe un 200 a tiempo.';

alter table public.whatsapp_inbound enable row level security;
alter table public.whatsapp_inbound force row level security;

create policy "whatsapp_inbound: ver"
  on public.whatsapp_inbound for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

revoke all on public.whatsapp_inbound from anon, authenticated;
grant select on public.whatsapp_inbound to authenticated;

-- ---------------------------------------------------------------------------
-- Estados de entrega
-- ---------------------------------------------------------------------------
-- Los estados de Meta llegan desordenados y repetidos. Se avanza y nunca se
-- retrocede: si ya sabemos que lo leyeron, un "entregado" que llega tarde no
-- puede borrar esa información.
create or replace function app.record_delivery(
  p_provider_id text,
  p_status      text,
  p_error       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.message_jobs
  set delivered_at = case
        when p_status in ('delivered', 'read') then coalesce(delivered_at, now())
        else delivered_at
      end,
      read_at = case
        when p_status = 'read' then coalesce(read_at, now())
        else read_at
      end,
      status = case
        when p_status = 'failed' then 'failed'::public.job_status
        else status
      end,
      last_error = case when p_status = 'failed' then p_error else last_error end
  where provider_message_id = p_provider_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Salud de la cuenta y corte automático
-- ---------------------------------------------------------------------------
-- Meta avisa cuando la calidad de un número cae. Si llega a rojo se frena todo
-- automáticamente: seguir enviando desde una cuenta en rojo es el camino
-- directo a que la limiten.
create or replace function app.record_account_health(
  p_phone_number_id text,
  p_quality         text default null,
  p_limit           text default null,
  p_status          text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  update public.whatsapp_accounts
  set quality_rating  = coalesce(p_quality, quality_rating),
      messaging_limit = coalesce(p_limit, messaging_limit),
      status          = coalesce(p_status, status),
      last_checked_at = now()
  where phone_number_id = p_phone_number_id
  returning tenant_id into v_tenant;

  if v_tenant is null then
    return;
  end if;

  if p_quality = 'RED' or p_status in ('restricted', 'disabled') then
    update public.messaging_settings
    set sending_enabled = false,
        paused_reason = case
          when p_quality = 'RED'
            then 'Meta marcó la calidad de tu número en rojo. Se frenaron los envíos para proteger la cuenta.'
          else 'Meta restringió tu número. Se frenaron los envíos.'
        end
    where tenant_id = v_tenant
      and sending_enabled;

    -- Lo que todavía no salió tampoco sale.
    update public.message_jobs
    set status = 'cancelled',
        skip_reason = 'Se frenó todo por la salud de la cuenta de WhatsApp.'
    where tenant_id = v_tenant and status = 'pending';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Respuestas de las clientas
-- ---------------------------------------------------------------------------
-- Palabras con las que alguien pide que no le escriban más. Se comparan sin
-- acentos y en minúsculas.
create or replace function app.is_opt_out(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select app.immutable_unaccent(lower(trim(coalesce(p_text, '')))) = any (array[
    'baja', 'stop', 'basta', 'no', 'no quiero', 'no me escriban',
    'no me escriban mas', 'darme de baja', 'dar de baja', 'eliminar',
    'cancelar suscripcion', 'no molesten', 'sacarme'
  ]);
$$;

/**
 * Procesa un mensaje entrante y hace lo que corresponda.
 *
 * Devuelve qué acción tomó, para que quede registrada y se pueda auditar.
 * Es idempotente por el índice único sobre wa_message_id: Meta reintenta los
 * webhooks que no responden a tiempo, y sin eso una clienta podría quedar dada
 * de baja y rehabilitada sola.
 */
create or replace function app.handle_inbound(
  p_phone_number_id text,
  p_wa_message_id   text,
  p_from            text,
  p_kind            text,
  p_body            text default null,
  p_payload         text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_client uuid;
  v_action text;
  v_appointment uuid;
begin
  -- Meta reintenta los webhooks que no reciben un 200 a tiempo. Si este
  -- mensaje ya se procesó, no se vuelve a ejecutar la acción: sin esto, una
  -- clienta podría quedar dada de baja dos veces o recibir dos notas de
  -- "pidió reprogramar".
  if exists (
    select 1 from public.whatsapp_inbound where wa_message_id = p_wa_message_id
  ) then
    return 'repetido';
  end if;

  select tenant_id into v_tenant
  from public.whatsapp_accounts
  where phone_number_id = p_phone_number_id;

  if v_tenant is null then
    return 'sin_estetica';
  end if;

  -- El teléfono llega sin el "+". Se busca por las dos formas.
  select id into v_client
  from public.clients
  where tenant_id = v_tenant
    and phone_e164 in (p_from, '+' || p_from)
  limit 1;

  -- Un botón de respuesta rápida trae "acción:id".
  if p_payload like 'confirmar:%' then
    v_appointment := nullif(split_part(p_payload, ':', 2), '')::uuid;

    update public.appointments
    set status = 'confirmed'
    where id = v_appointment
      and tenant_id = v_tenant
      and status = 'pending';

    v_action := case when found then 'turno_confirmado' else 'confirmacion_sin_efecto' end;

  elsif p_payload like 'reprogramar:%' then
    -- No se toca la agenda sola: se deja anotado para que alguien lo resuelva.
    v_appointment := nullif(split_part(p_payload, ':', 2), '')::uuid;
    if v_client is not null then
      insert into public.client_notes (tenant_id, client_id, body)
      values (v_tenant, v_client,
              'Pidió reprogramar su turno desde el recordatorio de WhatsApp.');
    end if;
    v_action := 'pidio_reprogramar';

  elsif app.is_opt_out(coalesce(p_payload, p_body)) then
    if v_client is not null then
      insert into public.opt_outs (tenant_id, client_id, channel, reason)
      values (v_tenant, v_client, 'whatsapp', 'Lo pidió por WhatsApp.')
      on conflict do nothing;
      v_action := 'dada_de_baja';
    else
      v_action := 'baja_sin_ficha';
    end if;
  end if;

  insert into public.whatsapp_inbound (
    tenant_id, client_id, wa_message_id, from_phone, kind, body, payload, action_taken
  )
  values (
    v_tenant, v_client, p_wa_message_id, p_from, p_kind, p_body, p_payload, v_action
  )
  on conflict (wa_message_id) do nothing;


  return coalesce(v_action, 'registrado');
end;
$$;

-- ---------------------------------------------------------------------------
-- Puerta de entrada para el webhook
-- ---------------------------------------------------------------------------
create or replace function public.rpc_record_delivery(
  p_provider_id text, p_status text, p_error text default null
)
returns void language sql security definer set search_path = ''
as $$ select app.record_delivery(p_provider_id, p_status, p_error); $$;

create or replace function public.rpc_record_account_health(
  p_phone_number_id text, p_quality text default null,
  p_limit text default null, p_status text default null
)
returns void language sql security definer set search_path = ''
as $$ select app.record_account_health(p_phone_number_id, p_quality, p_limit, p_status); $$;

create or replace function public.rpc_handle_inbound(
  p_phone_number_id text, p_wa_message_id text, p_from text,
  p_kind text, p_body text default null, p_payload text default null
)
returns text language sql security definer set search_path = ''
as $$ select app.handle_inbound(p_phone_number_id, p_wa_message_id, p_from, p_kind, p_body, p_payload); $$;

-- El webhook necesita el secreto de firma de la estética a la que llega.
create or replace function public.rpc_webhook_secrets(p_phone_number_id text)
returns table (tenant_id uuid, app_secret text, verify_token text)
language sql security definer set search_path = ''
as $$
  select wa.tenant_id, wa.app_secret, wa.verify_token
  from public.whatsapp_accounts wa
  where wa.phone_number_id = p_phone_number_id;
$$;

revoke all on function public.rpc_record_delivery(text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_record_account_health(text, text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_handle_inbound(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.rpc_webhook_secrets(text) from public, anon, authenticated;

grant execute on function public.rpc_record_delivery(text, text, text) to service_role;
grant execute on function public.rpc_record_account_health(text, text, text, text) to service_role;
grant execute on function public.rpc_handle_inbound(text, text, text, text, text, text) to service_role;
grant execute on function public.rpc_webhook_secrets(text) to service_role;
