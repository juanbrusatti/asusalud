-- ============================================================================
-- Dlay Agenda · Confirmado quiere decir que el cliente lo dijo
--
-- Hasta acá, un turno nacía confirmado. Eso hacía que el estado no sirviera
-- para nada: si todos están confirmados, el verde no distingue a nadie y la
-- pregunta que importa —¿quién va a venir mañana?— sigue sin respuesta.
--
-- Ahora todo nace SIN CONFIRMAR, incluida la reserva online: alguien que sacó
-- turno por internet hace tres semanas no dijo nada sobre mañana. Se pasa a
-- confirmado de dos maneras, y las dos son una persona diciéndolo:
--
--   · Alguien del equipo toca «Confirmar» en el turno, después de hablar.
--   · El cliente toca «Confirmar» en el recordatorio de WhatsApp.
--
-- Y los tres botones del recordatorio hacen las tres cosas de verdad:
--
--   CONFIRMAR        pasa el turno a confirmado y contesta.
--   CANCELAR         lo cancela y libera el horario.
--   CAMBIAR HORARIO  contesta con el enlace del turno, donde el cliente elige
--                    otro horario solo.
--
-- Contestar no cuesta nada: apretar un botón abre una ventana de veinticuatro
-- horas, y dentro de esa ventana el mensaje es de servicio.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La reserva online tampoco nace confirmada
-- ---------------------------------------------------------------------------
create or replace function public.booking_create(
  p_slug        text,
  p_service_ids uuid[],
  p_starts_at   timestamptz,
  p_first_name  text,
  p_last_name   text,
  p_phone       text,
  p_email       text default null,
  p_notes       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid;
  v_branch   uuid;
  v_tz       text;
  v_max_open integer;
  v_client   uuid;
  v_id       uuid;
  v_minutes  integer;
  v_buffer   integer;
  v_total    bigint;
  v_found    integer;
  v_abiertos integer;
begin
  select t.id, t.timezone, bs.max_open_per_client
    into v_tenant, v_tz, v_max_open
  from public.tenants t
  join public.booking_settings bs on bs.tenant_id = t.id
  where lower(t.slug) = lower(trim(p_slug))
    and t.status = 'active'
    and bs.enabled;

  if v_tenant is null then
    return jsonb_build_object('ok', false,
      'error', 'Este negocio no está tomando reservas online.');
  end if;

  if coalesce(trim(p_first_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Poné tu nombre.');
  end if;

  if coalesce(trim(p_phone), '') = '' then
    return jsonb_build_object('ok', false,
      'error', 'Hace falta un teléfono para poder avisarte.');
  end if;

  select b.id into v_branch
  from public.branches b where b.tenant_id = v_tenant and b.is_default limit 1;

  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         coalesce(max(s.buffer_minutes), 0),
         coalesce(sum(s.price_cents), 0)
    into v_found, v_minutes, v_buffer, v_total
  from unnest(p_service_ids) as sel(id)
  join public.services s
    on s.id = sel.id and s.tenant_id = v_tenant
   and s.is_active and s.is_bookable_online;

  if v_found <> coalesce(array_length(p_service_ids, 1), 0) or v_minutes = 0 then
    return jsonb_build_object('ok', false, 'error', 'Elegí un servicio válido.');
  end if;

  -- Se busca la ficha por teléfono. Si no existe se crea: la persona que
  -- reserva online puede no estar cargada todavía.
  select id into v_client
  from public.clients
  where tenant_id = v_tenant and phone_e164 = p_phone
  limit 1;

  if v_client is null then
    insert into public.clients
      (tenant_id, first_name, last_name, phone_e164, phone_raw, email)
    values (
      v_tenant, trim(p_first_name), nullif(trim(coalesce(p_last_name, '')), ''),
      p_phone, p_phone, nullif(lower(trim(coalesce(p_email, ''))), '')
    )
    returning id into v_client;
  else
    -- Se completa lo que falte, sin pisar lo que ya había cargado el negocio.
    update public.clients
    set email = coalesce(email, nullif(lower(trim(coalesce(p_email, ''))), '')),
        last_name = coalesce(last_name, nullif(trim(coalesce(p_last_name, '')), ''))
    where id = v_client;
  end if;

  -- Freno contra quien reserva media agenda. No es paranoia: una agenda
  -- pública sin este límite se llena de turnos fantasma en una tarde.
  select count(*) into v_abiertos
  from public.appointments a
  where a.client_id = v_client
    and a.starts_at > now()
    and a.status in ('pending', 'confirmed');

  if v_abiertos >= v_max_open then
    return jsonb_build_object('ok', false, 'error', format(
      'Ya tenés %s turnos reservados. Si querés otro, escribinos.', v_abiertos));
  end if;

  insert into public.appointments (
    tenant_id, branch_id, client_id, starts_at, ends_at, blocks_until,
    status, source, price_cents, notes
  )
  values (
    v_tenant, v_branch, v_client, p_starts_at,
    p_starts_at + make_interval(mins => v_minutes),
    p_starts_at + make_interval(mins => v_minutes + v_buffer),
    -- Antes nacía 'confirmed'. Reservar no es confirmar: quien sacó turno
    -- hace tres semanas no dijo nada sobre mañana, y es justo lo que el
    -- equipo necesita saber al mirar la agenda del día siguiente.
    'pending', 'online', v_total,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  insert into public.appointment_services (
    tenant_id, appointment_id, service_id,
    duration_minutes, buffer_minutes, price_cents, position
  )
  select v_tenant, v_id, s.id,
         s.duration_minutes, s.buffer_minutes, s.price_cents, sel.ord - 1
  from unnest(p_service_ids) with ordinality as sel(id, ord)
  join public.services s on s.id = sel.id;

  -- Se fuerza acá la verificación de cupos, que normalmente corre al cerrar la
  -- transacción. Si se dejara diferida, el error saltaría DESPUÉS de que esta
  -- función terminó, fuera de su manejador, y el cliente vería un error crudo
  -- de base de datos en lugar de una explicación.
  set constraints all immediate;
  -- Y se vuelve a diferir: el modo queda fijado para toda la transacción, y si
  -- quedara en inmediato, una segunda reserva en el mismo pedido se
  -- verificaría antes de que existan sus servicios.
  set constraints all deferred;

  -- El enlace de autogestión se devuelve acá y en ningún otro lado: es la
  -- única vez que se puede entregar sin que nadie tenga que demostrar quién
  -- es. Después sólo viaja dentro de los recordatorios, a la misma persona.
  return jsonb_build_object(
    'ok', true,
    'appointmentId', v_id,
    'manageToken', (
      select a.manage_token from public.appointments a where a.id = v_id
    )
  );

exception
  -- Alguien tomó ese mismo horario mientras esta persona completaba sus datos.
  -- El manejador deshace todo lo que hizo la función, así que no queda ningún
  -- turno a medias.
  when sqlstate '23P01' then
    return jsonb_build_object('ok', false,
      'error', 'Justo alguien tomó ese horario. Elegí otro, por favor.');
  when sqlstate '23514' then
    return jsonb_build_object('ok', false,
      'error', 'Ese horario no es válido para los servicios que elegiste.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1b. El turno que carga el equipo tampoco
-- ---------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_client      uuid,
  p_service_ids uuid[],
  p_starts_at   timestamptz,
  p_notes       text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant  uuid;
  v_branch  uuid;
  v_id      uuid;
  v_minutes integer;
  v_buffer  integer;
  v_total   bigint;
  v_found   integer;
begin
  -- La ficha ya pasó por RLS: si no se ve, no existe para quien llama.
  select c.tenant_id into v_tenant
  from public.clients c where c.id = p_client;

  if v_tenant is null then
    raise exception 'No encontramos esa ficha de cliente.' using errcode = '42501';
  end if;

  select b.id into v_branch
  from public.branches b
  where b.tenant_id = v_tenant and b.is_default
  limit 1;

  if v_branch is null then
    raise exception 'El negocio no tiene una sucursal principal.' using errcode = '23514';
  end if;

  select count(*),
         coalesce(sum(s.duration_minutes), 0),
         coalesce(max(s.buffer_minutes), 0),
         coalesce(sum(s.price_cents), 0)
    into v_found, v_minutes, v_buffer, v_total
  from unnest(p_service_ids) as sel(id)
  join public.services s on s.id = sel.id and s.tenant_id = v_tenant;

  if v_found <> coalesce(array_length(p_service_ids, 1), 0) then
    raise exception 'Alguno de esos servicios no es de este negocio.'
      using errcode = '42501';
  end if;

  if v_minutes = 0 then
    raise exception 'Elegí al menos un servicio.' using errcode = '23514';
  end if;

  insert into public.appointments (
    tenant_id, branch_id, client_id,
    starts_at, ends_at, blocks_until,
    status, source, price_cents, notes, created_by
  )
  values (
    v_tenant, v_branch, p_client,
    p_starts_at,
    p_starts_at + make_interval(mins => v_minutes),
    p_starts_at + make_interval(mins => v_minutes + v_buffer),
    -- Igual que la reserva online: agendar no es confirmar. El equipo carga
    -- el turno, y confirmado queda cuando el cliente lo dice —por el botón del
    -- recordatorio o hablando, y ahí alguien toca «Confirmar»—.
    'pending', 'staff', v_total, nullif(trim(coalesce(p_notes, '')), ''),
    (select auth.uid())
  )
  returning id into v_id;

  -- `with ordinality` conserva el orden en que se eligieron los servicios.
  insert into public.appointment_services (
    tenant_id, appointment_id, service_id,
    duration_minutes, buffer_minutes, price_cents, position
  )
  select v_tenant, v_id, s.id,
         s.duration_minutes, s.buffer_minutes, s.price_cents, sel.ord - 1
  from unnest(p_service_ids) with ordinality as sel(id, ord)
  join public.services s on s.id = sel.id and s.tenant_id = v_tenant;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Un botón más: cancelar
-- ---------------------------------------------------------------------------
alter table public.message_templates
  drop constraint if exists message_templates_quick_replies_valid;

alter table public.message_templates
  add constraint message_templates_quick_replies_valid
  check (quick_replies <@ array['confirmar', 'cancelar', 'reprogramar', 'baja']);

-- Las plantillas que ya están pasan a tener los tres botones.
update public.message_templates
set quick_replies = array['confirmar', 'cancelar', 'reprogramar']
where channel = 'whatsapp'
  and quick_replies @> array['confirmar']
  and not quick_replies @> array['cancelar'];

-- ---------------------------------------------------------------------------
-- 3. Qué pasa cuando alguien toca un botón
-- ---------------------------------------------------------------------------
-- Devuelve jsonb en lugar de texto porque ahora hay respuestas que mandar: el
-- enlace para cambiar el horario, y el acuse de las otras dos. Sin acuse, el
-- cliente aprieta y no pasa nada visible, así que vuelve a apretar.
drop function if exists public.rpc_handle_inbound(text, text, text, text, text, text);
drop function if exists app.handle_inbound(text, text, text, text, text, text);

create function app.handle_inbound(
  p_phone_number_id text,
  p_wa_message_id   text,
  p_from            text,
  p_kind            text,
  p_body            text default null,
  p_payload         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant      uuid;
  v_client      uuid;
  v_action      text;
  v_appointment uuid;
  v_token       text;
  v_sitio       text;
  v_respuesta   text;
  v_token_wa    text;
begin
  -- Meta reintenta los webhooks que no reciben un 200 a tiempo. Si este
  -- mensaje ya se procesó, no se vuelve a ejecutar la acción: sin esto, un
  -- cliente podría quedar dado de baja dos veces o recibir dos respuestas.
  if exists (
    select 1 from public.whatsapp_inbound where wa_message_id = p_wa_message_id
  ) then
    return jsonb_build_object('accion', 'repetido');
  end if;

  select tenant_id into v_tenant
  from public.whatsapp_accounts
  where phone_number_id = p_phone_number_id;

  if v_tenant is null then
    return jsonb_build_object('accion', 'sin_negocio');
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

    perform set_config('app.by_client', 'on', true);
    update public.appointments
    set status = 'confirmed'
    where id = v_appointment
      and tenant_id = v_tenant
      and status = 'pending';

    if found then
      v_action := 'turno_confirmado';
      v_respuesta := '¡Gracias! Quedó confirmado. Te esperamos.';
    else
      v_action := 'confirmacion_sin_efecto';
    end if;

  elsif p_payload like 'cancelar:%' then
    v_appointment := nullif(split_part(p_payload, ':', 2), '')::uuid;

    perform set_config('app.by_client', 'on', true);
    update public.appointments
    set status        = 'cancelled',
        cancelled_at  = now(),
        cancel_reason = 'Cancelado por el cliente desde WhatsApp'
    where id = v_appointment
      and tenant_id = v_tenant
      and status in ('pending', 'confirmed')
      and starts_at > now();

    if found then
      v_action := 'turno_cancelado';
      v_respuesta := 'Listo, cancelamos tu turno. Cuando quieras sacás otro.';
    else
      v_action := 'cancelacion_sin_efecto';
      v_respuesta := 'No pudimos cancelarlo solos. Escribinos y lo vemos.';
    end if;

  elsif p_payload like 'reprogramar:%' then
    v_appointment := nullif(split_part(p_payload, ':', 2), '')::uuid;

    select a.manage_token into v_token
    from public.appointments a
    where a.id = v_appointment
      and a.tenant_id = v_tenant
      and a.status in ('pending', 'confirmed')
      and a.starts_at > now();

    if v_token is not null then
      select rtrim(ps.value, '/') into v_sitio
      from public.platform_settings ps where ps.key = 'site_url';

      -- El enlace ya existe y hace todo: elegir otro horario, confirmar o
      -- cancelar. Antes esto sólo dejaba una nota y alguien tenía que llamar.
      v_action := 'pidio_reprogramar';
      v_respuesta := 'Elegí el horario que te quede mejor acá: '
                  || coalesce(v_sitio, '') || '/t/' || v_token;
    else
      v_action := 'reprogramar_sin_efecto';
      v_respuesta := 'No encontramos ese turno. Escribinos y lo vemos.';
    end if;

    -- Igual queda anotado, porque el equipo quiere saber quién pidió mover.
    if v_client is not null then
      insert into public.client_notes (tenant_id, client_id, body)
      values (v_tenant, v_client,
              'Pidió cambiar el horario desde el recordatorio de WhatsApp.');
    end if;

  elsif app.is_opt_out(coalesce(p_payload, p_body)) then
    if v_client is not null then
      insert into public.opt_outs (tenant_id, client_id, channel, reason)
      values (v_tenant, v_client, 'whatsapp', 'Lo pidió por WhatsApp.')
      on conflict do nothing;
      v_action := 'dado_de_baja';
      v_respuesta := 'Listo, no te escribimos más por acá.';
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

  if v_respuesta is null then
    return jsonb_build_object('accion', coalesce(v_action, 'registrado'));
  end if;

  select wa.access_token into v_token_wa
  from public.whatsapp_accounts wa
  where wa.phone_number_id = p_phone_number_id;

  return jsonb_build_object(
    'accion', coalesce(v_action, 'registrado'),
    'responder', jsonb_build_object(
      'a', p_from,
      'texto', v_respuesta,
      'phone_number_id', p_phone_number_id,
      'access_token', v_token_wa
    )
  );
end;
$$;

create function public.rpc_handle_inbound(
  p_phone_number_id text,
  p_wa_message_id   text,
  p_from            text,
  p_kind            text,
  p_body            text default null,
  p_payload         text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.handle_inbound(
    p_phone_number_id, p_wa_message_id, p_from, p_kind, p_body, p_payload
  );
$$;

revoke all on function public.rpc_handle_inbound(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_handle_inbound(text, text, text, text, text, text)
  to service_role;


-- ---------------------------------------------------------------------------
-- 4. Las cuentas nuevas nacen con los tres botones
-- ---------------------------------------------------------------------------
-- Son exactamente los tres que permite WhatsApp, así que entran justos.
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
