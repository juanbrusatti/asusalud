-- ============================================================================
-- Dlay Agenda · El turno que se carga tarde también avisa
--
-- Con un recordatorio de 24 horas antes, quien saca turno para mañana a la
-- tarde no recibía NADA: el momento del aviso ya había pasado cuando se cargó
-- el turno. Para una estética que agenda para la misma semana, eso puede ser
-- una porción grande de los turnos, y son justo los que más se olvidan.
--
-- Ahora el aviso sale en la próxima corrida del planificador, con dos límites:
--
--   · SÓLO AVISOS PREVIOS. Un «gracias por venir» atrasado no tiene sentido.
--   · SÓLO SI EL TURNO ES PARA OTRO DÍA. El recordatorio dice «mañana»:
--     mandarlo un rato antes del turno de hoy sería mentira, y avisarle a
--     alguien que ya está saliendo de su casa no le sirve de nada.
--
-- Se puede apagar por regla, porque no todos los negocios lo quieren.
-- ============================================================================

alter table public.reminder_rules
  add column catch_up boolean not null default true;

comment on column public.reminder_rules.catch_up is
  'Si un turno se carga después del momento del aviso, mandarlo igual en la '
  'próxima corrida. Sin esto, quien saca turno con poca anticipación no '
  'recibe ningún recordatorio.';

CREATE OR REPLACE FUNCTION app.plan_reminders(p_horizon interval DEFAULT '72:00:00'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_created integer := 0;
  v_rows    integer;
  r         record;
  v_tz      text;
  v_start   time;
  v_end     time;
  v_rate    bigint;
begin
  for r in
    select rr.*, t.timezone,
           ms.quiet_start, ms.quiet_end,
           ms.whatsapp_utility_cents, ms.whatsapp_marketing_cents,
           ms.sending_enabled
    from public.reminder_rules rr
    join public.tenants t on t.id = rr.tenant_id
    left join public.messaging_settings ms on ms.tenant_id = rr.tenant_id
    where rr.enabled and t.status = 'active'
  loop
    -- Si la estética tiene los envíos frenados, no se planifica nada. Frenar
    -- es frenar: si la cola se siguiera llenando, al despausar saldría todo
    -- junto de golpe, que es justo lo que provoca un bloqueo.
    if coalesce(r.sending_enabled, true) is false then
      continue;
    end if;

    v_tz    := r.timezone;
    v_start := coalesce(r.send_window_start, r.quiet_start, '09:00'::time);
    v_end   := coalesce(r.send_window_end,   r.quiet_end,   '21:00'::time);

    if r.trigger in ('before_appointment', 'after_appointment') then
      with candidatos as (
        select
          a.id as appointment_id,
          a.client_id,
          -- Si el turno se cargó tarde, el momento del aviso ya pasó. Sale
          -- ahora, no en un instante del pasado.
          greatest(
            a.starts_at + make_interval(mins => r.offset_minutes), now()
          ) as cuando
        from public.appointments a
        where a.tenant_id = r.tenant_id
          and a.status = any (r.statuses)
          and (
            cardinality(r.service_ids) = 0
            or exists (
              select 1 from public.appointment_services aps
              where aps.appointment_id = a.id
                and aps.service_id = any (r.service_ids)
            )
          )
          -- Sólo a quien ya faltó alguna vez, si la regla lo pide.
          and (
            not r.only_if_missed
            or exists (
              select 1 from public.appointments prev
              where prev.client_id = a.client_id
                and prev.status = 'no_show'
            )
          )
          and a.starts_at > now()
          and (
            -- El caso normal: el momento del aviso todavía no llegó.
            (a.starts_at + make_interval(mins => r.offset_minutes))
              between now() and now() + p_horizon

            -- O el turno se cargó tarde. Sin esto, quien saca turno para
            -- mañana a la tarde no recibe NINGÚN recordatorio, porque el
            -- momento del aviso —24 horas antes— ya pasó cuando se cargó.
            --
            -- Dos límites, y los dos importan:
            --
            --   · Sólo avisos previos. Un «gracias por venir» atrasado no
            --     tiene sentido.
            --   · Sólo si el turno es para OTRO DÍA. El recordatorio dice
            --     «mañana»: mandarlo un rato antes del turno de hoy sería
            --     mentira, y avisarle a alguien que ya está saliendo de su
            --     casa no le sirve para nada.
            or (
              r.catch_up
              and r.trigger = 'before_appointment'
              and (a.starts_at + make_interval(mins => r.offset_minutes)) < now()
              and (a.starts_at at time zone v_tz)::date
                  > (now() at time zone v_tz)::date
            )
          )
      )
      insert into public.message_jobs (
        tenant_id, rule_id, client_id, appointment_id,
        channel, template_id, scheduled_for, status, cost_cents,
        skip_reason, dedupe_key
      )
      select
        r.tenant_id, r.id, c.client_id, c.appointment_id,
        ch.canal,
        rt.template_id,
        app.shift_into_window(c.cuando, v_tz, v_start, v_end),
        (case when ch.canal is null then 'skipped' else 'pending' end)::public.job_status,
        case
          -- `is distinct from` y no `<>`: cuando no hay canal resuelto el
          -- valor es NULL, la comparación normal da NULL en vez de verdadero,
          -- y el envío salteado terminaba cargando la tarifa de WhatsApp.
          when ch.canal is distinct from 'whatsapp' then 0
          when tpl.category = 'marketing'
            then coalesce(r.whatsapp_marketing_cents, 8956)
          else coalesce(r.whatsapp_utility_cents, 3768)
        end,
        case when ch.canal is null
          then 'Esta persona no tiene ningún canal disponible para esta regla.'
        end,
        r.id::text || ':' || c.appointment_id::text
      from candidatos c
      cross join lateral (
        select app.resolve_channel(c.client_id, r.channel_order) as canal
      ) ch
      left join public.rule_templates rt
        on rt.rule_id = r.id and rt.channel = ch.canal
      left join public.message_templates tpl on tpl.id = rt.template_id
      on conflict (tenant_id, dedupe_key) do nothing;

    elsif r.trigger = 'birthday' then
      with candidatos as (
        select cl.id as client_id,
               (date_trunc('day', (now() at time zone v_tz))
                 + make_interval(mins => r.offset_minutes)) at time zone v_tz as cuando
        from public.clients cl
        where cl.tenant_id = r.tenant_id
          and cl.is_active
          and cl.birthdate is not null
          and to_char(cl.birthdate, 'MM-DD')
              = to_char((now() at time zone v_tz)::date, 'MM-DD')
      )
      insert into public.message_jobs (
        tenant_id, rule_id, client_id, channel, template_id,
        scheduled_for, status, cost_cents, skip_reason, dedupe_key
      )
      select
        r.tenant_id, r.id, c.client_id, ch.canal, rt.template_id,
        app.shift_into_window(c.cuando, v_tz, v_start, v_end),
        (case when ch.canal is null then 'skipped' else 'pending' end)::public.job_status,
        case
          -- `is distinct from` y no `<>`: cuando no hay canal resuelto el
          -- valor es NULL, la comparación normal da NULL en vez de verdadero,
          -- y el envío salteado terminaba cargando la tarifa de WhatsApp.
          when ch.canal is distinct from 'whatsapp' then 0
          when tpl.category = 'marketing'
            then coalesce(r.whatsapp_marketing_cents, 8956)
          else coalesce(r.whatsapp_utility_cents, 3768)
        end,
        case when ch.canal is null
          then 'Esta persona no tiene ningún canal disponible para esta regla.'
        end,
        r.id::text || ':' || c.client_id::text || ':'
          || to_char((now() at time zone v_tz)::date, 'YYYY')
      from candidatos c
      cross join lateral (
        select app.resolve_channel(c.client_id, r.channel_order) as canal
      ) ch
      left join public.rule_templates rt
        on rt.rule_id = r.id and rt.channel = ch.canal
      left join public.message_templates tpl on tpl.id = rt.template_id
      on conflict (tenant_id, dedupe_key) do nothing;

    elsif r.trigger = 'no_activity' then
      -- Reactivación: hace mucho que no viene y no tiene nada agendado.
      with candidatos as (
        select cl.id as client_id, now() as cuando
        from public.clients cl
        where cl.tenant_id = r.tenant_id
          and cl.is_active
          and not exists (
            select 1 from public.appointments a
            where a.client_id = cl.id
              and a.status not in ('cancelled', 'no_show')
              and a.starts_at > now() - make_interval(mins => r.offset_minutes)
          )
          and exists (
            select 1 from public.appointments a
            where a.client_id = cl.id and a.status = 'attended'
          )
      )
      insert into public.message_jobs (
        tenant_id, rule_id, client_id, channel, template_id,
        scheduled_for, status, cost_cents, skip_reason, dedupe_key
      )
      select
        r.tenant_id, r.id, c.client_id, ch.canal, rt.template_id,
        app.shift_into_window(c.cuando, v_tz, v_start, v_end),
        (case when ch.canal is null then 'skipped' else 'pending' end)::public.job_status,
        case
          -- `is distinct from` y no `<>`: cuando no hay canal resuelto el
          -- valor es NULL, la comparación normal da NULL en vez de verdadero,
          -- y el envío salteado terminaba cargando la tarifa de WhatsApp.
          when ch.canal is distinct from 'whatsapp' then 0
          when tpl.category = 'marketing'
            then coalesce(r.whatsapp_marketing_cents, 8956)
          else coalesce(r.whatsapp_utility_cents, 3768)
        end,
        case when ch.canal is null
          then 'Esta persona no tiene ningún canal disponible para esta regla.'
        end,
        -- Como mucho una vez por mes por persona.
        r.id::text || ':' || c.client_id::text || ':'
          || to_char((now() at time zone v_tz)::date, 'YYYY-MM')
      from candidatos c
      cross join lateral (
        select app.resolve_channel(c.client_id, r.channel_order) as canal
      ) ch
      left join public.rule_templates rt
        on rt.rule_id = r.id and rt.channel = ch.canal
      left join public.message_templates tpl on tpl.id = rt.template_id
      on conflict (tenant_id, dedupe_key) do nothing;
    end if;

    get diagnostics v_rows = row_count;
    v_created := v_created + v_rows;
  end loop;

  return v_created;
end;
$function$
;
