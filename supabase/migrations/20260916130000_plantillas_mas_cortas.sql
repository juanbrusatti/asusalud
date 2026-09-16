-- ============================================================================
-- Dlay Agenda · Menos huecos, más texto
--
-- Meta rechazó `recordatorio_dia_anterior` con un motivo que vale leer entero:
--
--   «La plantilla contiene demasiados parámetros variables relativos a la
--    longitud del mensaje. Debes disminuir el número de parámetros variables
--    o aumentar la longitud del mensaje.»
--
-- Teníamos seis huecos en un texto corto. Meta mira esa proporción para que
-- una plantilla no sea un cascarón que se llena con cualquier cosa.
--
-- Se resuelve por los dos lados a la vez:
--
--   · UN HUECO MENOS. {{fecha}} y {{hora}} se juntan en {{cuando}}. No se
--     pierde nada y se lee mejor: «martes 17 de septiembre a las 15:00» en
--     lugar de una fecha y una hora separadas por palabras de relleno.
--   · MÁS TEXTO FIJO. Se agrega la frase que de todos modos había que decir:
--     que avisen si no pueden venir, así el lugar se le da a otra persona.
--     Es la frase que baja el ausentismo, y ahora además hace pasar la
--     plantilla.
-- ============================================================================

update public.message_templates
set body = 'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte tu '
        || 'turno de mañana {{cuando}}, para {{servicio}}. {{preparacion}} '
        || 'Si no vas a poder venir, avisanos así le damos el lugar a otra '
        || 'persona. ¡Te esperamos!'
where channel = 'whatsapp'
  and provider_name = 'recordatorio_dia_anterior';

update public.message_templates
set body = 'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte '
        || 'que tenés turno el {{cuando}}, para {{servicio}}. {{preparacion}} '
        || 'Si ya sabés que no vas a poder, avisanos ahora así le damos el '
        || 'lugar a otra persona. ¡Gracias!'
where channel = 'whatsapp'
  and provider_name = 'aviso_una_semana_antes';

-- ---------------------------------------------------------------------------
-- Y las cuentas nuevas nacen así
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
       'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte tu '
       'turno de mañana {{cuando}}, para {{servicio}}. {{preparacion}} '
       'Si no vas a poder venir, avisanos así le damos el lugar a otra '
       'persona. ¡Te esperamos!',
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
       'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte '
       'que tenés turno el {{cuando}}, para {{servicio}}. {{preparacion}} '
       'Si ya sabés que no vas a poder, avisanos ahora así le damos el '
       'lugar a otra persona. ¡Gracias!',
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
