-- ============================================================================
-- Dlay Agenda · Cada servicio dice cómo prepararse
--
-- Asusalud pidió que el recordatorio de depilación diga que no hay que
-- depilarse con cera quince días antes, y el de un masaje diga otra cosa. O
-- sea: el mensaje tiene que cambiar según el servicio.
--
-- El camino obvio es una plantilla por servicio, y es el camino equivocado.
-- Con veinte servicios serían sesenta plantillas —una por canal— y, lo grave,
-- CADA PLANTILLA DE WHATSAPP HAY QUE APROBARLA EN META POR SEPARADO. Veinte
-- trámites, y cada corrección de texto vuelve a la cola de aprobación.
--
-- Acá va al revés: una sola plantilla, aprobada una vez, con un hueco
-- {{preparacion}} que cada servicio llena con lo suyo. Cambiar las
-- indicaciones de un servicio no vuelve a pasar por Meta nunca.
--
-- Si el turno tiene dos servicios, se encadenan las dos indicaciones.
-- ============================================================================

alter table public.services
  add column preparation_note text,
  add constraint services_preparation_len
    check (preparation_note is null or char_length(preparation_note) <= 300);

comment on column public.services.preparation_note is
  'Qué tiene que saber el cliente antes de venir a este servicio: qué traer, '
  'cómo prepararse, qué no hacer. Entra en el recordatorio por el hueco '
  '{{preparacion}}, así una sola plantilla sirve para todos los servicios.';

-- ---------------------------------------------------------------------------
-- El emisor recibe las indicaciones ya armadas
-- ---------------------------------------------------------------------------
drop function if exists app.jobs_payload(uuid[]);

create function app.jobs_payload(p_ids uuid[])
returns table (
  job_id            uuid,
  tenant_id         uuid,
  client_id         uuid,
  channel           public.message_channel,
  test_mode         boolean,
  client_name       text,
  client_email      text,
  client_phone      text,
  template_subject  text,
  template_body     text,
  provider_name     text,
  provider_language text,
  quick_replies     text[],
  appointment_id    uuid,
  tenant_name       text,
  tenant_timezone   text,
  appointment_at    timestamptz,
  service_names     text,
  preparation       text,
  phone_number_id   text,
  access_token      text,
  manage_url        text
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
    -- Las indicaciones de todos los servicios del turno, en orden y sin los
    -- que no tienen nada cargado. Un turno de depilación más perfilado lleva
    -- las dos cosas, una detrás de la otra.
    (
      select string_agg(
               trim(s.preparation_note), ' ' order by aps.position
             )
      from public.appointment_services aps
      join public.services s on s.id = aps.service_id
      where aps.appointment_id = a.id
        and coalesce(trim(s.preparation_note), '') <> ''
    ),
    wa.phone_number_id,
    wa.access_token,
    case when a.manage_token is not null then
      rtrim((select ps.value from public.platform_settings ps
             where ps.key = 'site_url'), '/')
      || '/t/' || a.manage_token
    end
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
-- Las plantillas de fábrica lo usan
-- ---------------------------------------------------------------------------
-- Es el momento de meterlo: todavía no hay ninguna plantilla aprobada en Meta,
-- así que agregar el hueco ahora no cuesta un trámite. Después sí.
--
-- Va en un lugar distinto en cada canal, y no da lo mismo: en el correo, las
-- indicaciones tienen que ir con el turno y no después de la firma.
update public.message_templates
set body = 'Hola {{cliente}}! Te recordamos tu turno en {{estetica}} mañana '
        || '{{fecha}} a las {{hora}} para {{servicio}}. {{preparacion}}'
where name = 'Recordatorio del día anterior · WhatsApp'
  and body not like '%{{preparacion}}%';

update public.message_templates
set body = '{{cliente}}, mañana a las {{hora}} te esperamos para {{servicio}}. '
        || '{{preparacion}} Tocá este aviso para confirmar o cambiarlo.'
where name = 'Recordatorio del día anterior · notificación'
  and body not like '%{{preparacion}}%';

update public.message_templates
set body = E'Hola {{cliente}}:\n\n'
        || E'Te recordamos tu turno de mañana {{fecha}} a las {{hora}} para {{servicio}}.\n\n'
        || E'{{preparacion}}\n\n'
        || E'Si necesitás cambiarlo o avisar que no podés venir, se hace desde acá, '
        || E'sin llamar ni escribir:\n{{link}}\n\n'
        || E'¡Te esperamos!\n{{estetica}}'
where name = 'Recordatorio del día anterior · correo'
  and body not like '%{{preparacion}}%';

update public.message_templates
set body = 'Hola {{cliente}}! Te recordamos que tenés turno en {{estetica}} el '
        || '{{fecha}} a las {{hora}} para {{servicio}}. {{preparacion}}'
where name = 'Aviso una semana antes · WhatsApp'
  and body not like '%{{preparacion}}%';

update public.message_templates
set body = '{{cliente}}, el {{fecha}} a las {{hora}} te esperamos para '
        || '{{servicio}}. {{preparacion}} Tocá si necesitás cambiarlo.'
where name = 'Aviso una semana antes · notificación'
  and body not like '%{{preparacion}}%';

update public.message_templates
set body = E'Hola {{cliente}}:\n\n'
        || E'Te escribimos con tiempo para recordarte tu turno del {{fecha}} a las '
        || E'{{hora}} para {{servicio}}.\n\n'
        || E'{{preparacion}}\n\n'
        || E'Si ya sabés que no vas a poder, cambiarlo ahora nos ayuda a darle el '
        || E'lugar a otra persona:\n{{link}}\n\n'
        || E'¡Gracias!\n{{estetica}}'
where name = 'Aviso una semana antes · correo'
  and body not like '%{{preparacion}}%';


-- ---------------------------------------------------------------------------
-- Y las cuentas nuevas nacen con el hueco puesto
-- ---------------------------------------------------------------------------
create or replace function app.seed_messaging(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_regla uuid;
begin
  -- La guarda mira las REGLAS y no las plantillas. Un negocio con plantillas
  -- sueltas y ninguna regla es precisamente el que no funciona: mirando las
  -- plantillas lo saltearíamos y lo dejaríamos roto para siempre.
  if exists (select 1 from public.reminder_rules where tenant_id = p_tenant)
  then
    return;
  end if;

  -- =========================================================================
  -- 1. El recordatorio del día anterior. La única encendida.
  -- =========================================================================
  insert into public.reminder_rules (
    tenant_id, name, enabled, trigger, offset_minutes,
    send_window_start, send_window_end
  )
  values (
    p_tenant, 'Recordatorio del día anterior', true, 'before_appointment',
    -1440, '09:00', '20:00'
  )
  returning id into v_regla;

  insert into public.message_templates
      (tenant_id, name, channel, category, subject, body,
       provider_name, quick_replies)
    values
      (p_tenant, 'Recordatorio del día anterior · notificación', 'push',
       'utility', 'Tu turno es mañana',
       '{{cliente}}, mañana a las {{hora}} te esperamos para {{servicio}}. '
       '{{preparacion}} Tocá este aviso para confirmar o cambiarlo.',
       null, '{}'),

      (p_tenant, 'Recordatorio del día anterior · correo', 'email',
       'utility', 'Tu turno en {{estetica}} es mañana',
       E'Hola {{cliente}}:\n\n'
       || E'Te recordamos tu turno de mañana {{fecha}} a las {{hora}} para {{servicio}}.\n\n'
       || E'{{preparacion}}\n\n'
       || E'Si necesitás cambiarlo o avisar que no podés venir, se hace desde acá, '
       || E'sin llamar ni escribir:\n{{link}}\n\n'
       || E'¡Te esperamos!\n{{estetica}}',
       null, '{}'),

      (p_tenant, 'Recordatorio del día anterior · WhatsApp', 'whatsapp',
       'utility', null,
       'Hola {{cliente}}! Te recordamos tu turno en {{estetica}} mañana '
       '{{fecha}} a las {{hora}} para {{servicio}}. {{preparacion}}',
       'recordatorio_dia_anterior', '{confirmar,cancelar,reprogramar}')
  -- Si alguna ya existía con ese nombre, se respeta la que está.
  on conflict do nothing;

  insert into public.rule_templates (rule_id, channel, template_id, tenant_id)
  select v_regla, m.channel, m.id, p_tenant
  from public.message_templates m
  where m.tenant_id = p_tenant
    and m.name like 'Recordatorio del día anterior · %'
  on conflict do nothing;

  -- =========================================================================
  -- 2. El aviso de la semana. Apagada.
  --
  -- Es justo lo que el sistema anterior no podía hacer: avisar de un turno
  -- que está a más de una semana. Nace apagada porque duplica los mensajes
  -- por turno, y esa es una decisión de plata que le toca a cada negocio.
  -- =========================================================================
  insert into public.reminder_rules (
    tenant_id, name, enabled, trigger, offset_minutes,
    send_window_start, send_window_end
  )
  values (
    p_tenant, 'Aviso una semana antes', false, 'before_appointment',
    -10080, '09:00', '20:00'
  )
  returning id into v_regla;

  insert into public.message_templates
      (tenant_id, name, channel, category, subject, body,
       provider_name, quick_replies)
    values
      (p_tenant, 'Aviso una semana antes · notificación', 'push',
       'utility', 'Tu turno es la semana que viene',
       '{{cliente}}, el {{fecha}} a las {{hora}} te esperamos para '
       '{{servicio}}. {{preparacion}} Tocá si necesitás cambiarlo.',
       null, '{}'),

      (p_tenant, 'Aviso una semana antes · correo', 'email',
       'utility', 'Tu turno en {{estetica}} es el {{fecha}}',
       E'Hola {{cliente}}:\n\n'
       || E'Te escribimos con tiempo para recordarte tu turno del {{fecha}} a las '
       || E'{{hora}} para {{servicio}}.\n\n'
       || E'{{preparacion}}\n\n'
       || E'Si ya sabés que no vas a poder, cambiarlo ahora nos ayuda a darle el '
       || E'lugar a otra persona:\n{{link}}\n\n'
       || E'¡Gracias!\n{{estetica}}',
       null, '{}'),

      (p_tenant, 'Aviso una semana antes · WhatsApp', 'whatsapp',
       'utility', null,
       'Hola {{cliente}}! Te recordamos que tenés turno en {{estetica}} el '
       '{{fecha}} a las {{hora}} para {{servicio}}. {{preparacion}}',
       'aviso_una_semana_antes', '{confirmar,cancelar,reprogramar}')
  on conflict do nothing;

  insert into public.rule_templates (rule_id, channel, template_id, tenant_id)
  select v_regla, m.channel, m.id, p_tenant
  from public.message_templates m
  where m.tenant_id = p_tenant
    and m.name like 'Aviso una semana antes · %'
  on conflict do nothing;
end;
$$;
