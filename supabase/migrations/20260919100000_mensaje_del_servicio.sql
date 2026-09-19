-- ============================================================================
-- Dlay Agenda · Cada servicio escribe su propio mensaje
--
-- Hasta acá el servicio aportaba una sola cosa al recordatorio: cómo
-- prepararse. Pero no todos los servicios tienen preparación, y los que no
-- tienen quedaban con el hueco relleno de oficio. Lo que cada servicio
-- necesita decir es más amplio que "no te depiles 15 días antes".
--
-- Así que el hueco pasa a llamarse {{mensaje}} y adentro puede usar los otros:
--
--   Hola {{cliente}}! Te esperamos el {{cuando}} para {{servicio}}.
--   No te depiles con cera ni pinza 15 días antes.
--
-- escrito en el servicio, llega armado. Un servicio corto pone una línea y
-- listo; uno con indicaciones pone las que necesita.
--
-- POR QUÉ NO SE VA MÁS LEJOS QUE ESTO. Lo natural sería dejar la plantilla en
-- «Hola {{mensaje}} nos vemos pronto» y que el servicio traiga todo. No se
-- puede, y el motivo ya lo conocemos de primera mano: Meta rechaza las
-- plantillas con muchas variables para el largo del texto. Es la razón por la
-- que existe {{cuando}} —juntar fecha y hora sacó una variable de encima—. Una
-- plantilla de veinte caracteres fijos cargando un parámetro de trescientos es
-- ese mismo rechazo, pero peor.
--
-- El renombre NO vuelve a pasar por Meta. Meta nunca ve nuestros nombres: ve
-- {{1}}, {{2}}, {{3}}. Mientras la cantidad de huecos y su orden no cambien, el
-- cuerpo aprobado es idéntico y las plantillas ya aprobadas siguen sirviendo.
-- ============================================================================

comment on column public.services.preparation_note is
  'El mensaje propio de este servicio dentro del recordatorio. Entra por el '
  'hueco {{mensaje}} y puede usar {{cliente}}, {{cuando}} y los demás: se '
  'arma primero el texto del servicio y después la plantilla.';

-- Mismo hueco, nombre nuevo. Uno por uno y sólo si todavía dice el viejo.
update public.message_templates
set body = replace(body, '{{preparacion}}', '{{mensaje}}')
where body like '%{{preparacion}}%';

update public.message_templates
set subject = replace(subject, '{{preparacion}}', '{{mensaje}}')
where subject like '%{{preparacion}}%';

-- ---------------------------------------------------------------------------
-- Sólo WhatsApp
-- ---------------------------------------------------------------------------
-- Asusalud dejó en claro que sus clientas se manejan por WhatsApp. Las push
-- piden que la clienta acepte notificaciones en el navegador y el correo pide
-- que haya correo cargado: en la práctica la cascada bajaba igual a WhatsApp,
-- y mientras tanto había cuatro plantillas de más que mantener y entender.
--
-- El motor de canales NO se toca: sigue entero. Lo que cambia es con qué nace
-- una cuenta. Volver a encender correo o push es agregar el canal a la regla,
-- no rehacer nada.
--
-- OJO CON LA PLATA: la cascada existía para ahorrar. Cada WhatsApp cuesta
-- $37,68 y una push no cuesta nada. Con esto, todo recordatorio se cobra.
update public.reminder_rules
set channel_order = '{whatsapp}'
where channel_order <> '{whatsapp}'::public.message_channel[];

alter table public.reminder_rules
  alter column channel_order set default '{whatsapp}';

-- Lo que ya estaba encolado para esos canales se queda sin plantilla, y el
-- emisor lo marcaría como error: «la regla no tiene un mensaje cargado para
-- este canal». No es un error, es que el canal dejó de usarse antes de que
-- saliera. Se saltea con el motivo escrito, que es lo que se ve en el detalle
-- del envío.
update public.message_jobs
set status = 'skipped',
    skip_reason = 'El negocio pasó a enviar sólo por WhatsApp.'
where status = 'pending'
  and channel in ('push', 'email');

-- Se desenganchan de las reglas y se apagan, pero NO se borran.
--
-- Borrarlas sería más prolijo y es lo que se pidió, con un problema: cuatro de
-- las doce que hay en producción tienen fecha de modificación posterior a la
-- de creación. Puede haber sido una de nuestras migraciones —varias les
-- tocaron el cuerpo— o puede haber sido alguien escribiendo su propio texto de
-- correo. Desde acá no se distingue, y la diferencia entre las dos es que una
-- se recupera de git y la otra no existe en ningún otro lado.
--
-- Apagadas no se envían, no entran en ninguna cascada y no se pueden elegir en
-- una regla. Lo único que queda es la fila. Si confirmamos que nadie las tocó
-- a mano, borrarlas después es una línea.
delete from public.rule_templates rt
using public.message_templates t
where rt.template_id = t.id
  and t.channel in ('push', 'email');

update public.message_templates
set is_active = false
where channel in ('push', 'email')
  and is_active;

-- ---------------------------------------------------------------------------
-- Y las cuentas nuevas nacen así
-- ---------------------------------------------------------------------------
-- Los cuerpos son los que están hoy en producción, no los originales: pasaron
-- por dos correcciones que costaron un rechazo de Meta cada una —el cierre con
-- texto fijo y la reducción de huecos— y volver a la versión vieja las
-- reintroduce.
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
       'Si no vas a poder venir, avisanos así le damos el lugar a otra '
       'persona. ¡Te esperamos!',
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
       'Si ya sabés que no vas a poder, avisanos ahora así le damos el '
       'lugar a otra persona. ¡Gracias!',
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
