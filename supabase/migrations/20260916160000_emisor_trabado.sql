-- ============================================================================
-- Dlay Agenda · Los envíos se trababan y nadie se enteraba
--
-- `rpc_jobs_payload` es el envoltorio que el emisor llama para pedir los datos
-- de cada envío, y declara su lista de columnas a mano. Al agregar
-- `preparation` a `app.jobs_payload` me olvidé de actualizarlo, así que quedó
-- diciendo que devuelve veintiuna columnas cuando la de adentro devuelve
-- veintidós.
--
-- Postgres lo rechaza con «return type mismatch». Y el efecto era el peor
-- posible:
--
--   1. El emisor toma los envíos y los marca `sending`.
--   2. Pide los datos y esa llamada falla.
--   3. El emisor corta con un 500 y NUNCA CIERRA los envíos tomados.
--
-- Quedan en `sending` para siempre: desaparecen de «Próximos envíos» —ya no
-- están pendientes— y no aparecen en ningún contador. Desde afuera parece que
-- se evaporaron. Cuatro quedaron así, uno de ayer.
--
-- Se arregla el envoltorio y, sobre todo, se hace que un envío tomado no pueda
-- quedar tomado para siempre.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El envoltorio, al día
-- ---------------------------------------------------------------------------
drop function if exists public.rpc_jobs_payload(uuid[]);

create function public.rpc_jobs_payload(p_ids uuid[])
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
  select * from app.jobs_payload(p_ids);
$$;

revoke all on function public.rpc_jobs_payload(uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_jobs_payload(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Un envío tomado no puede quedar tomado para siempre
-- ---------------------------------------------------------------------------
-- Es el arreglo que importa. Si el emisor se cae, se queda sin tiempo o falla
-- una llamada intermedia, los envíos que había tomado quedaban muertos. Ahora
-- se recuperan solos: si uno lleva más de diez minutos en `sending`, la
-- próxima corrida lo vuelve a tomar.
--
-- Diez minutos es cómodo: la corrida más lenta manda veinte mensajes con
-- pausas de hasta cuatro segundos, o sea menos de dos minutos.
create or replace function app.claim_due_jobs(p_limit integer default 20)
returns setof public.message_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j        public.message_jobs;
  v_day    integer;
  v_week   integer;
  v_max_d  integer;
  v_max_w  integer;
  v_on     boolean;
  v_budget bigint;
  v_tz     text;
  v_spent  bigint;
begin
  for j in
    update public.message_jobs m
    set status = 'sending', attempts = m.attempts + 1
    where m.id in (
      select id from public.message_jobs
      where channel is not null
        and (
          (status = 'pending' and scheduled_for <= now())
          -- Tomado y nunca cerrado: el emisor se cayó en el medio.
          or (status = 'sending' and updated_at < now() - interval '10 minutes'
              and attempts < 5)
        )
      order by scheduled_for
      for update skip locked
      limit p_limit
    )
    returning m.*
  loop
    select coalesce(ms.sending_enabled, true),
           coalesce(ms.max_per_client_per_day, 2),
           coalesce(ms.max_per_client_per_week, 5),
           ms.monthly_budget_cents,
           t.timezone
      into v_on, v_max_d, v_max_w, v_budget, v_tz
    from public.tenants t
    left join public.messaging_settings ms on ms.tenant_id = t.id
    where t.id = j.tenant_id;

    if not v_on then
      update public.message_jobs set status = 'pending' where id = j.id;
      continue;
    end if;

    select count(*) into v_day
    from public.message_jobs m
    where m.client_id = j.client_id
      and m.status = 'sent'
      and m.sent_at > now() - interval '24 hours';

    select count(*) into v_week
    from public.message_jobs m
    where m.client_id = j.client_id
      and m.status = 'sent'
      and m.sent_at > now() - interval '7 days';

    if v_day >= v_max_d or v_week >= v_max_w then
      update public.message_jobs
      set status = 'skipped',
          skip_reason = format(
            'Tope alcanzado: ya recibió %s mensaje(s) hoy y %s esta semana.',
            v_day, v_week
          )
      where id = j.id;
      continue;
    end if;

    if v_budget is not null and coalesce(j.cost_cents, 0) > 0 then
      select coalesce(sum(m.cost_cents), 0) into v_spent
      from public.message_jobs m
      where m.tenant_id = j.tenant_id
        and m.status = 'sent'
        and not m.was_test
        and m.sent_at >= (
          date_trunc('month', (now() at time zone coalesce(v_tz, 'UTC')))
        ) at time zone coalesce(v_tz, 'UTC');

      if v_spent + j.cost_cents > v_budget then
        update public.message_jobs
        set status = 'skipped',
            skip_reason = format(
              'Tope del mes alcanzado: van $ %s de $ %s.',
              round(v_spent / 100.0, 2), round(v_budget / 100.0, 2)
            )
        where id = j.id;
        continue;
      end if;
    end if;

    return next j;
  end loop;
end;
$$;

comment on function app.claim_due_jobs(integer) is
  'Toma envíos vencidos y recupera los que quedaron tomados sin cerrar. '
  'Respeta los topes por persona y el de plata del mes; el de plata no frena '
  'los canales gratis.';

-- ---------------------------------------------------------------------------
-- 3. Los que quedaron trabados, de vuelta a la cola
-- ---------------------------------------------------------------------------
update public.message_jobs
set status = 'pending', attempts = 0
where status = 'sending';
