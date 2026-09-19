-- ============================================================================
-- Dlay Agenda · La bandeja de WhatsApp
--
-- Al conectar un número a la API de Meta, ese número deja de funcionar en el
-- teléfono. Los botones de confirmar y cancelar ya se resuelven solos, pero lo
-- que la clienta escribe aparte entraba, se guardaba y no lo leía nadie.
--
-- Faltaban dos cosas, y la primera no se veía: LO QUE SALE NO SE GUARDABA. El
-- webhook contesta «¡Gracias! Quedó confirmado.» directo contra Meta y esa
-- respuesta no quedaba en ningún lado. Una bandeja armada sólo con lo que
-- entra muestra media conversación: las preguntas sin las respuestas, y quien
-- la lee no sabe si alguien contestó o no.
--
-- LA VENTANA DE 24 HORAS. Meta deja escribir texto libre sólo dentro de las 24
-- horas posteriores al último mensaje de la clienta. Pasadas esas horas el
-- envío se rechaza con el error 131047 y sólo entra una plantilla aprobada.
-- Por eso la ventana no es un detalle de la pantalla: es un dato de la
-- conversación, y se calcula acá para que la pantalla no pueda mentir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- whatsapp_outbound · lo que sale escrito a mano (o por el sistema)
-- ---------------------------------------------------------------------------
-- Las plantillas NO van acá: viven en message_jobs con su costo y su estado de
-- entrega. Acá va el texto libre, que es gratis y no tiene plantilla.
create table public.whatsapp_outbound (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete set null,

  to_phone      text not null,
  body          text not null,

  -- Lo que devuelve Meta. Null si el envío falló.
  wa_message_id text,
  -- Quién lo escribió. Null significa que lo contestó el sistema solo.
  sent_by       uuid references public.profiles (id) on delete set null,
  error         text,

  sent_at       timestamptz not null default now(),

  constraint whatsapp_outbound_body_len
    check (char_length(trim(body)) between 1 and 4096)
);

create index whatsapp_outbound_tenant_idx
  on public.whatsapp_outbound (tenant_id, sent_at desc);
create index whatsapp_outbound_phone_idx
  on public.whatsapp_outbound (tenant_id, to_phone, sent_at desc);

comment on table public.whatsapp_outbound is
  'Texto libre que sale por WhatsApp: las respuestas automáticas a los botones '
  'y lo que se escribe desde la bandeja. Las plantillas no van acá, van en '
  'message_jobs, porque esas se cobran y estas no.';

alter table public.whatsapp_outbound enable row level security;
alter table public.whatsapp_outbound force row level security;

-- Se lee, no se escribe. Mandar un WhatsApp necesita el token del negocio, que
-- vive fuera del alcance de authenticated a propósito: el envío pasa por el
-- servidor, y si acá hubiera un insert cualquiera con la consola abierta se
-- inventaría respuestas que nunca salieron.
create policy "whatsapp_outbound: ver"
  on public.whatsapp_outbound for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );

revoke all on public.whatsapp_outbound from anon, authenticated;
grant select on public.whatsapp_outbound to authenticated;

-- ---------------------------------------------------------------------------
-- El teléfono, siempre igual
-- ---------------------------------------------------------------------------
-- Meta manda el número sin el «+» y las fichas lo guardan con «+». Agrupar por
-- el texto crudo parte la misma conversación en dos.
create or replace function app.solo_digitos(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- ---------------------------------------------------------------------------
-- Las dos puntas de la conversación, en una sola línea de tiempo
-- ---------------------------------------------------------------------------
create or replace view public.whatsapp_mensajes as
  select
    i.tenant_id,
    app.solo_digitos(i.from_phone) as telefono,
    i.client_id,
    true      as entrante,
    i.body,
    i.payload,
    i.kind,
    null::uuid as sent_by,
    i.received_at as cuando
  from public.whatsapp_inbound i
  union all
  select
    o.tenant_id,
    app.solo_digitos(o.to_phone),
    o.client_id,
    false,
    o.body,
    null,
    'text',
    o.sent_by,
    o.sent_at
  from public.whatsapp_outbound o
  where o.error is null;

comment on view public.whatsapp_mensajes is
  'Lo que entra y lo que sale, mezclado y ordenable por fecha. Es lo que hace '
  'legible una conversación: media conversación no se entiende.';

-- La vista hereda la RLS de las tablas de abajo porque se declara así.
alter view public.whatsapp_mensajes set (security_invoker = true);
grant select on public.whatsapp_mensajes to authenticated;

-- ---------------------------------------------------------------------------
-- Hasta cuándo se puede contestar
-- ---------------------------------------------------------------------------
-- Meta abre 24 horas desde el último mensaje de la clienta. Apretar un botón
-- también cuenta como mensaje suyo, así que cada confirmación las reabre.
create or replace function app.ventana_hasta(p_tenant uuid, p_telefono text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max(i.received_at) + interval '24 hours'
  from public.whatsapp_inbound i
  where i.tenant_id = p_tenant
    and app.solo_digitos(i.from_phone) = app.solo_digitos(p_telefono);
$$;

revoke all on function app.ventana_hasta(uuid, text) from public, anon;
grant execute on function app.ventana_hasta(uuid, text) to authenticated;

revoke all on function app.solo_digitos(text) from public, anon;
grant execute on function app.solo_digitos(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- La lista de conversaciones
-- ---------------------------------------------------------------------------
-- Se agrupa por teléfono y no por ficha de clienta a propósito: quien escribe
-- desde un número que no está en la agenda también tiene que aparecer. Si no,
-- el mensaje de alguien nuevo es justo el que se pierde.
create or replace function public.whatsapp_conversaciones(p_tenant uuid)
returns table (
  telefono       text,
  client_id      uuid,
  nombre         text,
  ultimo_texto   text,
  ultimo_entrante boolean,
  ultimo_at      timestamptz,
  ventana_hasta  timestamptz,
  sin_responder  boolean
)
language sql
stable
set search_path = ''
as $$
  with ultimo as (
    select distinct on (m.telefono)
      m.telefono, m.client_id, m.body, m.entrante, m.cuando, m.payload
    from public.whatsapp_mensajes m
    where m.tenant_id = p_tenant
    order by m.telefono, m.cuando desc
  ),
  ficha as (
    -- El client_id del último mensaje puede venir nulo aunque la ficha exista
    -- (la clienta escribió antes de estar cargada). Se resuelve por teléfono.
    select u.telefono,
           coalesce(u.client_id, c.id) as client_id,
           trim(c.first_name || ' ' || coalesce(c.last_name, '')) as nombre
    from ultimo u
    left join public.clients c
      on c.tenant_id = p_tenant
     and app.solo_digitos(c.phone_e164) = u.telefono
  )
  select
    u.telefono,
    f.client_id,
    nullif(f.nombre, ''),
    u.body,
    u.entrante,
    u.cuando,
    app.ventana_hasta(p_tenant, u.telefono),
    -- Escribió algo y todavía nadie le contestó. Apretar un botón no cuenta:
    -- eso el sistema ya lo respondió solo.
    u.entrante and u.payload is null
  from ultimo u
  join ficha f on f.telefono = u.telefono
  order by u.cuando desc;
$$;

comment on function public.whatsapp_conversaciones(uuid) is
  'Una fila por teléfono, con el último mensaje y hasta cuándo se puede '
  'contestar. Corre con los permisos de quien llama, así que la RLS de las '
  'tablas de abajo ya limita las filas a sus estéticas.';

revoke all on function public.whatsapp_conversaciones(uuid) from public, anon;
grant execute on function public.whatsapp_conversaciones(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Una conversación
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_conversacion(
  p_tenant uuid, p_telefono text
)
returns table (
  entrante boolean,
  body     text,
  payload  text,
  cuando   timestamptz,
  sent_by  uuid
)
language sql
stable
set search_path = ''
as $$
  select m.entrante, m.body, m.payload, m.cuando, m.sent_by
  from public.whatsapp_mensajes m
  where m.tenant_id = p_tenant
    and m.telefono = app.solo_digitos(p_telefono)
  order by m.cuando;
$$;

revoke all on function public.whatsapp_conversacion(uuid, text) from public, anon;
grant execute on function public.whatsapp_conversacion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Anotar lo que sale
-- ---------------------------------------------------------------------------
-- La usan el webhook —para sus respuestas automáticas— y el envío a mano.
-- Sólo service_role: mandar un WhatsApp necesita el token del negocio, que
-- authenticated no puede ver.
create or replace function public.rpc_record_outbound(
  p_tenant     uuid,
  p_to_phone   text,
  p_body       text,
  p_wa_message_id text default null,
  p_sent_by    uuid default null,
  p_error      text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.whatsapp_outbound
    (tenant_id, client_id, to_phone, body, wa_message_id, sent_by, error)
  select
    p_tenant,
    (select c.id from public.clients c
      where c.tenant_id = p_tenant
        and app.solo_digitos(c.phone_e164) = app.solo_digitos(p_to_phone)
      limit 1),
    p_to_phone, p_body, p_wa_message_id, p_sent_by, p_error
  returning id;
$$;

revoke all on function public.rpc_record_outbound(uuid, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_record_outbound(uuid, text, text, text, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Que la bandeja se entere sola
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.whatsapp_inbound;
alter publication supabase_realtime add table public.whatsapp_outbound;

-- Para el webhook, que sabe con qué número contestó pero no de qué estética
-- es. Resolverlo acá evita tocar `handle_inbound`, que es larga y ya funciona.
create or replace function public.rpc_record_reply(
  p_phone_number_id text,
  p_to_phone        text,
  p_body            text,
  p_wa_message_id   text default null,
  p_error           text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.rpc_record_outbound(
    (select wa.tenant_id from public.whatsapp_accounts wa
      where wa.phone_number_id = p_phone_number_id),
    p_to_phone, p_body, p_wa_message_id, null, p_error
  );
$$;

revoke all on function public.rpc_record_reply(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_record_reply(text, text, text, text, text)
  to service_role;
