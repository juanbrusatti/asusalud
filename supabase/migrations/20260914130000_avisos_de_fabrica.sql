-- ============================================================================
-- Dlay Agenda · Una cuenta nueva nace sabiendo avisar
--
-- Hasta acá, una cuenta recién creada tenía cero plantillas y cero reglas. No
-- es que estuvieran mal configuradas: no existían. El planificador corría cada
-- cinco minutos, no encontraba ninguna regla y no programaba nada. O sea que
-- el recordatorio —que es la razón por la que alguien cambia de sistema— no
-- funcionaba hasta que la persona construyera todo desde cero.
--
-- Nadie construye desde cero. Se crea la cuenta, no ve que pase nada, y no
-- vuelve.
--
-- Tres decisiones:
--
--   1. UNA SOLA REGLA ENCENDIDA. La del día anterior, que es la que evita los
--      plantones. Las demás nacen apagadas: se ven, se entienden y se prenden
--      cuando se quieran. Un sistema que empieza mandando cuatro mensajes por
--      turno es un sistema que termina bloqueado.
--
--   2. CON FRANJA HORARIA. De 9 a 20. Un recordatorio a las tres de la
--      mañana es peor que ninguno, y es exactamente el error que nadie ve
--      venir hasta que ya lo mandó.
--
--   3. LA PLANTILLA DE WHATSAPP YA SABE CÓMO SE VA A LLAMAR. El nombre que
--      hay que dar de alta en Meta está decidido de antemana y escrito acá.
--      Así la pantalla de conexión puede decir «creá una plantilla que se
--      llame exactamente así, con este texto», en vez de dejar a la persona
--      inventando un nombre que después no coincide con nada.
-- ============================================================================

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
       'Tocá este aviso para confirmar o cambiarlo.',
       null, '{}'),

      (p_tenant, 'Recordatorio del día anterior · correo', 'email',
       'utility', 'Tu turno en {{estetica}} es mañana',
       E'Hola {{cliente}}:\n\n'
       || E'Te recordamos tu turno de mañana {{fecha}} a las {{hora}} para {{servicio}}.\n\n'
       || E'Si necesitás cambiarlo o avisar que no podés venir, se hace desde acá, '
       || E'sin llamar ni escribir:\n{{link}}\n\n'
       || E'¡Te esperamos!\n{{estetica}}',
       null, '{}'),

      (p_tenant, 'Recordatorio del día anterior · WhatsApp', 'whatsapp',
       'utility', null,
       'Hola {{cliente}}! Te recordamos tu turno en {{estetica}} mañana '
       '{{fecha}} a las {{hora}} para {{servicio}}.',
       'recordatorio_dia_anterior', '{confirmar,reprogramar}')
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
       '{{servicio}}. Tocá si necesitás cambiarlo.',
       null, '{}'),

      (p_tenant, 'Aviso una semana antes · correo', 'email',
       'utility', 'Tu turno en {{estetica}} es el {{fecha}}',
       E'Hola {{cliente}}:\n\n'
       || E'Te escribimos con tiempo para recordarte tu turno del {{fecha}} a las '
       || E'{{hora}} para {{servicio}}.\n\n'
       || E'Si ya sabés que no vas a poder, cambiarlo ahora nos ayuda a darle el '
       || E'lugar a otra persona:\n{{link}}\n\n'
       || E'¡Gracias!\n{{estetica}}',
       null, '{}'),

      (p_tenant, 'Aviso una semana antes · WhatsApp', 'whatsapp',
       'utility', null,
       'Hola {{cliente}}! Te recordamos que tenés turno en {{estetica}} el '
       '{{fecha}} a las {{hora}} para {{servicio}}.',
       'aviso_una_semana_antes', '{confirmar,reprogramar}')
  on conflict do nothing;

  insert into public.rule_templates (rule_id, channel, template_id, tenant_id)
  select v_regla, m.channel, m.id, p_tenant
  from public.message_templates m
  where m.tenant_id = p_tenant
    and m.name like 'Aviso una semana antes · %'
  on conflict do nothing;
end;
$$;

comment on function app.seed_messaging(uuid) is
  'Deja a un negocio con sus plantillas y sus reglas listas. Idempotente: si '
  'ya tiene reglas, no toca nada. Respeta las plantillas que ya existan con '
  'el mismo nombre.';

-- ---------------------------------------------------------------------------
-- Toda cuenta nueva pasa por acá
-- ---------------------------------------------------------------------------
create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant public.tenants;
  v_branch uuid;
begin
  if v_uid is null then
    raise exception 'Hace falta estar autenticado para crear un negocio.'
      using errcode = '42501';
  end if;

  insert into public.tenants (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning * into v_tenant;

  insert into public.memberships (tenant_id, user_id, role, status)
  values (v_tenant.id, v_uid, 'owner', 'active');

  insert into public.branches (tenant_id, name, is_default)
  values (v_tenant.id, 'Principal', true)
  returning id into v_branch;

  insert into public.messaging_settings (tenant_id) values (v_tenant.id);
  insert into public.booking_settings (tenant_id) values (v_tenant.id);

  -- Un horario razonable para empezar, que después se ajusta.
  insert into public.business_hours (tenant_id, branch_id, weekday, opens_at, closes_at)
  select v_tenant.id, v_branch, d, '09:00'::time, '19:00'::time
  from generate_series(1, 5) as d;

  -- Y con sus avisos listos, que es lo que hace que el sistema sirva para algo
  -- desde el primer turno y no después de una tarde de configuración.
  perform app.seed_messaging(v_tenant.id);

  return v_tenant;
end;
$$;

-- ---------------------------------------------------------------------------
-- Los que ya existen
-- ---------------------------------------------------------------------------
-- Las cuentas creadas antes de esto quedaron sin nada. Se les completa ahora,
-- sin tocar a quien ya hubiera cargado sus propias plantillas.
do $$
declare
  t uuid;
begin
  for t in select id from public.tenants loop
    perform app.seed_messaging(t);
  end loop;
end;
$$;
