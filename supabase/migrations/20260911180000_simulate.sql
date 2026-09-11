-- ============================================================================
-- Dlay Estética · Simulador
--
-- Antes de activar una regla hay que poder ver a cuánta gente le va a llegar,
-- por qué canal y cuánto sale. Sin esto, activar una regla es apostar: nadie
-- descubre que una campaña costaba medio millón de pesos DESPUÉS de mandarla.
--
-- SECURITY INVOKER: corre con los permisos de quien pregunta, así que sólo ve
-- los turnos y las fichas de su propia estética.
-- ============================================================================

create or replace function public.simulate_rule(
  p_trigger        public.reminder_trigger,
  p_offset_minutes integer,
  p_channel_order  public.message_channel[],
  p_service_ids    uuid[] default '{}',
  p_statuses       public.appointment_status[] default '{pending,confirmed}',
  p_only_if_missed boolean default false,
  p_days_ahead     integer default 30
)
returns table (
  channel     public.message_channel,
  recipients  bigint,
  cost_cents  bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ajustes as (
    select
      coalesce(ms.whatsapp_utility_cents, 3768) as utility_cents,
      ms.tenant_id
    from public.messaging_settings ms
    limit 1
  ),
  destinatarios as (
    -- Turnos que caerían dentro de la ventana simulada.
    select distinct a.client_id
    from public.appointments a
    where p_trigger in ('before_appointment', 'after_appointment')
      and a.status = any (p_statuses)
      and (
        cardinality(p_service_ids) = 0
        or exists (
          select 1 from public.appointment_services aps
          where aps.appointment_id = a.id
            and aps.service_id = any (p_service_ids)
        )
      )
      and (
        not p_only_if_missed
        or exists (
          select 1 from public.appointments prev
          where prev.client_id = a.client_id and prev.status = 'no_show'
        )
      )
      and a.starts_at + make_interval(mins => p_offset_minutes)
          between now() and now() + make_interval(days => p_days_ahead)

    union

    -- Cumpleaños dentro de la ventana simulada.
    select cl.id
    from public.clients cl
    where p_trigger = 'birthday'
      and cl.is_active
      and cl.birthdate is not null

    union

    -- Gente dormida, para reactivación.
    select cl.id
    from public.clients cl
    where p_trigger = 'no_activity'
      and cl.is_active
      and exists (
        select 1 from public.appointments a
        where a.client_id = cl.id and a.status = 'attended'
      )
      and not exists (
        select 1 from public.appointments a
        where a.client_id = cl.id
          and a.status not in ('cancelled', 'no_show')
          and a.starts_at > now() - make_interval(mins => p_offset_minutes)
      )
  ),
  resueltos as (
    select app.resolve_channel(d.client_id, p_channel_order) as canal
    from destinatarios d
  )
  select
    r.canal,
    count(*) as recipients,
    case
      when r.canal = 'whatsapp'
        then count(*) * (select utility_cents from ajustes)
      else 0
    end as cost_cents
  from resueltos r
  group by r.canal
  order by r.canal nulls last;
$$;

comment on function public.simulate_rule is
  'Cuánta gente alcanzaría una regla, por qué canal y a qué costo. Se usa '
  'antes de activarla: el número tiene que verse ANTES, no en la factura.';

revoke all on function public.simulate_rule(
  public.reminder_trigger, integer, public.message_channel[], uuid[],
  public.appointment_status[], boolean, integer
) from public;
grant execute on function public.simulate_rule(
  public.reminder_trigger, integer, public.message_channel[], uuid[],
  public.appointment_status[], boolean, integer
) to authenticated;
