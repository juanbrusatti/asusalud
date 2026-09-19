-- ============================================================================
-- Dlay Agenda · Que entre el mensaje que la estética ya venía mandando
--
-- Al pasar los servicios de Asusalud aparecieron dos cosas.
--
-- PRIMERA: 300 caracteres no alcanzan. El mensaje de depilación y el de las
-- limpiezas de cutis —el que explica la política de ausencias, con alias de
-- pago incluido— rondan los 500. Recortarlos sería decidir por ellas qué parte
-- de su política no se dice.
--
-- El techo nuevo es 600 y sale de una cuenta, no de un número redondo: Meta
-- corta el cuerpo de un mensaje en 1024 caracteres. El marco fijo ocupa ~195 y
-- las otras variables ~125 entre nombre, negocio, fecha y servicios. Quedan
-- ~700; 600 deja aire para un turno con dos servicios de nombre largo.
--
-- SEGUNDA: el cierre se contradecía con ellas. Nuestra plantilla decía
-- «avisanos así le damos el lugar a otra persona» y el texto de la estética
-- dice «si no asistís, la sesión se da por realizada, no se realizan cambios».
-- Además el mensaje que ellas mandaban terminaba en «Responder: CONFIRMAR o
-- CANCELAR», que acá lo hacen los botones. El cierre nuevo dice eso mismo.
--
-- Cambiar el cuerpo no cuesta un trámite todavía: las dos plantillas están en
-- `draft` y nunca se mandaron a aprobar. Después de aprobarlas, sí.
-- ============================================================================

alter table public.services
  drop constraint if exists services_preparation_len;

alter table public.services
  add constraint services_preparation_len
    check (preparation_note is null or char_length(preparation_note) <= 600);

-- ---------------------------------------------------------------------------
-- El cierre habla de los botones
-- ---------------------------------------------------------------------------
update public.message_templates
set body = 'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte tu '
        || 'turno de mañana {{cuando}}, para {{servicio}}. {{mensaje}} '
        || 'Con los botones de acá abajo podés confirmar el turno o avisarnos '
        || 'que no vas a venir. ¡Te esperamos!'
where channel = 'whatsapp'
  and provider_name = 'recordatorio_dia_anterior'
  and provider_status = 'draft';

update public.message_templates
set body = 'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte '
        || 'que tenés turno el {{cuando}}, para {{servicio}}. {{mensaje}} '
        || 'Con los botones de acá abajo podés confirmar el turno o avisarnos '
        || 'que no vas a venir. ¡Gracias!'
where channel = 'whatsapp'
  and provider_name = 'aviso_una_semana_antes'
  and provider_status = 'draft';

-- ---------------------------------------------------------------------------
-- Y las cuentas nuevas nacen con ese cierre
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
    channel_order, send_window_start, send_window_end
  )
  values (
    p_tenant, 'Recordatorio del día anterior', true, 'before_appointment',
    -1440, '{whatsapp}', '09:00', '20:00'
  )
  returning id into v_regla;

  insert into public.message_templates
      (tenant_id, name, channel, category, subject, body,
       provider_name, quick_replies)
    values
      (p_tenant, 'Recordatorio del día anterior · WhatsApp', 'whatsapp',
       'utility', null,
       'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte tu '
       'turno de mañana {{cuando}}, para {{servicio}}. {{mensaje}} '
       'Con los botones de acá abajo podés confirmar el turno o avisarnos '
       'que no vas a venir. ¡Te esperamos!',
       'recordatorio_dia_anterior', '{confirmar,cancelar,reprogramar}')
  -- Si alguna ya existía con ese nombre, se respeta la que está.
  on conflict do nothing;

  insert into public.rule_templates (rule_id, channel, template_id, tenant_id)
  select v_regla, m.channel, m.id, p_tenant
  from public.message_templates m
  where m.tenant_id = p_tenant
    and m.name = 'Recordatorio del día anterior · WhatsApp'
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
    channel_order, send_window_start, send_window_end
  )
  values (
    p_tenant, 'Aviso una semana antes', false, 'before_appointment',
    -10080, '{whatsapp}', '09:00', '20:00'
  )
  returning id into v_regla;

  insert into public.message_templates
      (tenant_id, name, channel, category, subject, body,
       provider_name, quick_replies)
    values
      (p_tenant, 'Aviso una semana antes · WhatsApp', 'whatsapp',
       'utility', null,
       'Hola {{cliente}}! Te escribimos de {{estetica}} para recordarte '
       'que tenés turno el {{cuando}}, para {{servicio}}. {{mensaje}} '
       'Con los botones de acá abajo podés confirmar el turno o avisarnos '
       'que no vas a venir. ¡Gracias!',
       'aviso_una_semana_antes', '{confirmar,cancelar,reprogramar}')
  on conflict do nothing;

  insert into public.rule_templates (rule_id, channel, template_id, tenant_id)
  select v_regla, m.channel, m.id, p_tenant
  from public.message_templates m
  where m.tenant_id = p_tenant
    and m.name = 'Aviso una semana antes · WhatsApp'
  on conflict do nothing;
end;
$$;
