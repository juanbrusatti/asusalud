-- ============================================================================
-- Dlay Estética · Motor de recordatorios
--
-- El corazón del producto. Una regla es una frase completa:
--
--   CUANDO falten 24 horas para el turno
--   PARA   los turnos confirmados de depilación
--   ENVIAR esta plantilla
--   POR    push, si no correo, si no WhatsApp
--   DENTRO de la franja de 9 a 21
--
-- Dos ideas sostienen todo el diseño:
--
--   1. EL CANAL SE ELIGE, NO SE ASUME. Cada regla lleva un orden de
--      preferencia y el sistema baja por él hasta encontrar uno que esa
--      persona tenga. Push y correo no cuestan nada; WhatsApp cuesta $37,68
--      por mensaje. La diferencia entre mandar todo por WhatsApp y usar la
--      cascada son decenas de miles de pesos por mes.
--
--   2. NADA SE ENVÍA DOS VECES. Cada envío planificado lleva una clave de
--      deduplicación única. El planificador puede correr de más, reintentarse
--      o solaparse: la fila ya existe y no se duplica. El bug de "me llegaron
--      cuatro recordatorios" no puede ocurrir estructuralmente.
-- ============================================================================

-- Cuándo se dispara una regla.
create type public.reminder_trigger as enum (
  'before_appointment',  -- X tiempo antes del turno
  'after_appointment',   -- X tiempo después: reseñas, seguimiento
  'birthday',            -- el día del cumpleaños
  'no_activity'          -- sin turnos desde hace X: reactivación
);

create type public.message_channel as enum ('push', 'email', 'whatsapp');

-- Categoría de Meta. Define el precio y las reglas que hay que respetar.
create type public.message_category as enum ('utility', 'marketing');

create type public.job_status as enum (
  'pending',   -- esperando su hora
  'sending',   -- tomado por el despachador
  'sent',      -- entregado al proveedor
  'failed',    -- el proveedor lo rechazó
  'skipped',   -- no correspondía enviarlo (baja, sin canal, tope diario)
  'cancelled'  -- el turno se canceló o se movió antes de que saliera
);

-- ---------------------------------------------------------------------------
-- messaging_settings · una fila por estética
-- ---------------------------------------------------------------------------
create table public.messaging_settings (
  tenant_id   uuid primary key references public.tenants (id) on delete cascade,

  -- Franja horaria por defecto. Un recordatorio a las 3 de la mañana se
  -- bloquea solo, sin que haga falta configurarlo regla por regla.
  quiet_start time not null default '09:00',
  quiet_end   time not null default '21:00',

  -- Techo duro por persona. Es la red de seguridad contra reglas mal armadas.
  max_per_client_per_day  integer not null default 2,
  max_per_client_per_week integer not null default 5,

  -- Cuánto cuesta un mensaje de WhatsApp, en centavos de la moneda de la
  -- estética. Se guarda acá y no en el código porque Meta lo cambia y porque
  -- cada país tiene el suyo.
  whatsapp_utility_cents   bigint not null default 3768,
  whatsapp_marketing_cents bigint not null default 8956,

  -- Tope de gasto mensual. Si se supera, la cola se frena y avisa.
  monthly_budget_cents bigint,

  -- Interruptor general. Sirve para frenar todo sin tocar las reglas.
  sending_enabled boolean not null default true,
  paused_reason   text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint messaging_settings_window check (quiet_end > quiet_start),
  constraint messaging_settings_caps check (
    max_per_client_per_day between 1 and 20 and
    max_per_client_per_week between 1 and 50
  )
);

comment on table public.messaging_settings is
  'Reglas que valen para toda la estética y que ninguna regla individual puede '
  'saltear: franja horaria, topes por persona y presupuesto.';

create trigger messaging_settings_touch_updated_at
  before update on public.messaging_settings
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- message_templates
-- ---------------------------------------------------------------------------
create table public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,

  name        text not null,
  channel     public.message_channel not null,
  category    public.message_category not null default 'utility',

  -- Para WhatsApp: el nombre exacto de la plantilla aprobada por Meta y su
  -- idioma. Sin aprobación no se puede enviar, así que el estado se guarda.
  provider_name     text,
  provider_language text default 'es_AR',
  provider_status   text not null default 'draft'
                      check (provider_status in ('draft','pending','approved','rejected','paused')),

  subject  text,          -- sólo correo
  body     text not null, -- admite {{cliente}}, {{fecha}}, {{hora}}, {{servicio}}, {{estetica}}

  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint message_templates_body_len check (char_length(trim(body)) between 5 and 1024),
  -- Una plantilla de WhatsApp sin nombre en Meta no se puede enviar.
  constraint message_templates_whatsapp_needs_provider check (
    channel <> 'whatsapp' or provider_name is not null
  )
);

create unique index message_templates_tenant_name_key
  on public.message_templates (tenant_id, lower(name));
create index message_templates_tenant_channel_idx
  on public.message_templates (tenant_id, channel) where is_active;

comment on column public.message_templates.provider_status is
  'Estado en Meta. Una plantilla que cae en calidad baja se pausa sola del '
  'lado de ellos, y acá queda reflejado para no seguir intentando.';

create trigger message_templates_touch_updated_at
  before update on public.message_templates
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- reminder_rules
-- ---------------------------------------------------------------------------
create table public.reminder_rules (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,

  name        text not null,
  enabled     boolean not null default false,

  trigger     public.reminder_trigger not null,

  -- Un entero con signo resuelve los seis casos: -10080 son siete días antes,
  -- -1440 un día antes, -120 dos horas antes, +1440 un día después.
  -- SIN TOPE SUPERIOR: acá desaparece la limitación del sistema anterior, que
  -- no dejaba recordar con más de una semana de anticipación.
  offset_minutes integer not null,

  -- Orden de preferencia. El despachador baja por la lista hasta encontrar un
  -- canal que esa persona tenga disponible.
  channel_order public.message_channel[] not null default '{push,email,whatsapp}',

  -- Filtros. Vacío significa "todos".
  service_ids uuid[] not null default '{}',
  statuses    public.appointment_status[] not null default '{pending,confirmed}',
  -- Sólo a quien ya faltó alguna vez. Es la palanca más grande de ahorro:
  -- una clienta con cien turnos y cero faltas no necesita tres avisos.
  only_if_missed boolean not null default false,

  send_window_start time,
  send_window_end   time,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reminder_rules_name_len check (char_length(trim(name)) between 2 and 80),
  -- Un año para atrás o para adelante es más que suficiente y evita que un
  -- error de tipeo genere envíos absurdos.
  constraint reminder_rules_offset_range check (offset_minutes between -525600 and 525600),
  constraint reminder_rules_needs_channels check (array_length(channel_order, 1) >= 1),
  constraint reminder_rules_window check (
    (send_window_start is null) = (send_window_end is null)
    and (send_window_start is null or send_window_end > send_window_start)
  ),
  -- Un recordatorio previo al turno tiene que mirar hacia atrás en el tiempo.
  constraint reminder_rules_offset_matches_trigger check (
    case trigger
      when 'before_appointment' then offset_minutes < 0
      when 'after_appointment'  then offset_minutes > 0
      when 'no_activity'        then offset_minutes > 0
      else true
    end
  )
);

create index reminder_rules_tenant_idx
  on public.reminder_rules (tenant_id) where enabled;

comment on table public.reminder_rules is
  'Una fila es una frase: cuándo, para quiénes, qué mensaje y por qué canal. '
  'Nace apagada a propósito: activarla es un acto deliberado.';
comment on column public.reminder_rules.offset_minutes is
  'Minutos con signo respecto del disparador. Negativo es antes. Sin tope de '
  'una semana: recordar un turno con quince días de anticipación es válido.';

create trigger reminder_rules_touch_updated_at
  before update on public.reminder_rules
  for each row execute function app.touch_updated_at();

create trigger reminder_rules_audit
  after insert or update or delete on public.reminder_rules
  for each row execute function app.audit('tenant_id');

-- Qué plantilla usa cada regla en cada canal.
create table public.rule_templates (
  rule_id     uuid not null references public.reminder_rules (id) on delete cascade,
  channel     public.message_channel not null,
  template_id uuid not null references public.message_templates (id) on delete restrict,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,

  primary key (rule_id, channel)
);

create index rule_templates_template_idx on public.rule_templates (template_id);
create index rule_templates_tenant_idx on public.rule_templates (tenant_id);

-- ---------------------------------------------------------------------------
-- opt_outs · quién no quiere recibir
-- ---------------------------------------------------------------------------
create table public.opt_outs (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  -- Null significa "por ningún canal".
  channel    public.message_channel,
  reason     text,
  created_at timestamptz not null default now()
);

-- Dos índices parciales en lugar de uno con coalesce: convertir un enum a
-- texto no es inmutable y Postgres no lo acepta dentro de un índice.
create unique index opt_outs_channel_key
  on public.opt_outs (client_id, channel) where channel is not null;
create unique index opt_outs_global_key
  on public.opt_outs (client_id) where channel is null;
create index opt_outs_tenant_idx on public.opt_outs (tenant_id);

comment on table public.opt_outs is
  'Lista de bajas. Se consulta antes de cada envío. Una baja ignorada no es un '
  'error de producto: es una denuncia que termina en bloqueo.';

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
-- Las push del navegador son el único canal verdaderamente gratis e ilimitado.
-- La tabla existe ya porque el resolutor de canales necesita poder preguntar
-- si esta persona tiene una.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  client_id  uuid references public.clients (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),

  -- O es de una clienta o es de alguien del equipo, nunca las dos cosas.
  constraint push_subscriptions_owner check (
    (client_id is not null) <> (user_id is not null)
  )
);

create unique index push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
create index push_subscriptions_client_idx on public.push_subscriptions (client_id) where client_id is not null;

-- ---------------------------------------------------------------------------
-- message_jobs · la cola
-- ---------------------------------------------------------------------------
create table public.message_jobs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  rule_id     uuid references public.reminder_rules (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,

  channel     public.message_channel,
  template_id uuid references public.message_templates (id) on delete set null,

  scheduled_for timestamptz not null,
  status      public.job_status not null default 'pending',

  -- Lo que se sabe de antemano que va a costar. Es lo que alimenta el
  -- simulador: antes de activar una regla se ve a cuánta gente le llega y
  -- cuánto sale.
  cost_cents  bigint not null default 0,

  attempts    integer not null default 0,
  last_error  text,
  skip_reason text,
  provider_message_id text,

  -- Un envío planificado es único. El planificador puede correr de más,
  -- solaparse o reintentarse: la fila ya existe y no se duplica.
  dedupe_key  text not null,

  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  updated_at  timestamptz not null default now()
);

create unique index message_jobs_dedupe_key on public.message_jobs (tenant_id, dedupe_key);
-- El índice del despachador: lo que está por salir, en orden.
create index message_jobs_due_idx
  on public.message_jobs (scheduled_for) where status = 'pending';
create index message_jobs_tenant_idx on public.message_jobs (tenant_id, scheduled_for desc);
create index message_jobs_client_day_idx on public.message_jobs (client_id, scheduled_for);
create index message_jobs_appointment_idx
  on public.message_jobs (appointment_id) where appointment_id is not null;

comment on table public.message_jobs is
  'La cola. Una fila por envío planificado, con el canal ya resuelto y el '
  'costo estimado. Nunca se borra: es también la bitácora de lo que salió.';

create trigger message_jobs_touch_updated_at
  before update on public.message_jobs
  for each row execute function app.touch_updated_at();

-- Si el turno se cancela o se mueve, lo que todavía no salió se cancela con él.
-- Un recordatorio de un turno que ya no existe es el peor mensaje posible.
create or replace function app.cancel_jobs_for_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'no_show')
     or new.starts_at is distinct from old.starts_at then
    update public.message_jobs
    set status = 'cancelled',
        skip_reason = case
          when new.status = 'cancelled' then 'El turno se canceló.'
          when new.status = 'no_show'   then 'La clienta no vino.'
          else 'El turno se movió de horario.'
        end
    where appointment_id = new.id
      and status = 'pending';
  end if;

  return new;
end;
$$;

create trigger appointments_cancel_pending_jobs
  after update of status, starts_at on public.appointments
  for each row execute function app.cancel_jobs_for_appointment();

-- ============================================================================
-- Resolutor de canales
-- ============================================================================
-- Devuelve por dónde hay que avisarle a esta persona, o NULL si no hay forma.
--
-- Es la función que decide la factura del mes: push y correo no cuestan nada,
-- WhatsApp cuesta $37,68 cada uno. Bajar por la lista en orden, y no mandar
-- todo por WhatsApp porque es lo que más se lee, es la diferencia entre seis
-- mil pesos y cuarenta mil.
create or replace function app.resolve_channel(
  p_client uuid,
  p_order  public.message_channel[]
)
returns public.message_channel
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client public.clients;
  v_order  public.message_channel[] := p_order;
  v_ch     public.message_channel;
begin
  select * into v_client from public.clients c where c.id = p_client;
  if not found or not v_client.is_active then
    return null;
  end if;

  -- Una decisión humana manda sobre la preferencia de la regla.
  if v_client.channel_mode = 'none' then
    return null;
  elsif v_client.channel_mode <> 'auto' then
    v_order := array[v_client.channel_mode::text::public.message_channel];
  end if;

  foreach v_ch in array v_order loop
    -- La baja se respeta siempre, sea del canal o de todo.
    if exists (
      select 1 from public.opt_outs o
      where o.client_id = p_client
        and (o.channel is null or o.channel = v_ch)
    ) then
      continue;
    end if;

    if v_ch = 'push' and exists (
      select 1 from public.push_subscriptions ps where ps.client_id = p_client
    ) then
      return v_ch;
    elsif v_ch = 'email' and v_client.email is not null then
      return v_ch;
    elsif v_ch = 'whatsapp' and v_client.phone_e164 is not null then
      return v_ch;
    end if;
  end loop;

  return null;
end;
$$;

-- ============================================================================
-- Franja horaria
-- ============================================================================
-- Corre un envío hacia adelante hasta que caiga dentro de la franja en que se
-- puede molestar. Un recordatorio a las 3 de la mañana se bloquea solo.
create or replace function app.shift_into_window(
  p_when     timestamptz,
  p_timezone text,
  p_start    time,
  p_end      time
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_local timestamp := p_when at time zone p_timezone;
  v_time  time := v_local::time;
begin
  if p_start is null or p_end is null then
    return p_when;
  end if;

  if v_time < p_start then
    -- Demasiado temprano: sale al abrir la franja, ese mismo día.
    return (date_trunc('day', v_local) + p_start) at time zone p_timezone;
  elsif v_time >= p_end then
    -- Demasiado tarde: espera a la mañana siguiente.
    return (date_trunc('day', v_local) + interval '1 day' + p_start) at time zone p_timezone;
  end if;

  return p_when;
end;
$$;

-- ============================================================================
-- Planificador
-- ============================================================================
-- Materializa en la cola los envíos de las próximas horas.
--
-- Es idempotente por diseño: cada envío lleva una clave única, así que correr
-- de más no duplica nada. Eso permite que corra seguido y sin coordinación.
create or replace function app.plan_reminders(p_horizon interval default '72 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
          a.starts_at + make_interval(mins => r.offset_minutes) as cuando
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
          and a.starts_at + make_interval(mins => r.offset_minutes)
              between now() and now() + p_horizon
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
$$;

comment on function app.plan_reminders(interval) is
  'Llena la cola con los envíos de las próximas horas. Idempotente: correr de '
  'más no duplica nada. Lo llama pg_cron cada cinco minutos.';

-- ============================================================================
-- Despachador
-- ============================================================================
-- Toma los envíos vencidos y los deja listos para que el emisor los mande.
--
-- `for update skip locked` permite que corran varios despachadores sin que se
-- pisen: cada uno se lleva filas distintas.
--
-- Los topes por persona se verifican acá y no al planificar, porque dependen
-- de lo que REALMENTE salió, no de lo que se pensaba mandar.
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
begin
  for j in
    update public.message_jobs m
    set status = 'sending', attempts = m.attempts + 1
    where m.id in (
      select id from public.message_jobs
      where status = 'pending'
        and scheduled_for <= now()
        and channel is not null
      order by scheduled_for
      for update skip locked
      limit p_limit
    )
    returning m.*
  loop
    select coalesce(ms.sending_enabled, true),
           coalesce(ms.max_per_client_per_day, 2),
           coalesce(ms.max_per_client_per_week, 5)
      into v_on, v_max_d, v_max_w
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

    return next j;
  end loop;
end;
$$;

comment on function app.claim_due_jobs(integer) is
  'Toma envíos vencidos para mandarlos, respetando los topes por persona y el '
  'interruptor general. Lo llama el emisor cada minuto.';

-- ============================================================================
-- Alta de la estética: settings por defecto
-- ============================================================================
-- Se recrea create_tenant para que toda estética nueva nazca con su
-- configuración de mensajería. Sin esto, la primera regla que se active
-- enviaría sin franja horaria ni topes.
create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_tenant public.tenants;
begin
  if v_uid is null then
    raise exception 'Hace falta estar autenticado para crear una estética.'
      using errcode = '42501';
  end if;

  insert into public.tenants (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning * into v_tenant;

  insert into public.memberships (tenant_id, user_id, role, status)
  values (v_tenant.id, v_uid, 'owner', 'active');

  insert into public.branches (tenant_id, name, is_default)
  values (v_tenant.id, 'Principal', true);

  insert into public.messaging_settings (tenant_id)
  values (v_tenant.id);

  return v_tenant;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.messaging_settings enable row level security;
alter table public.message_templates  enable row level security;
alter table public.reminder_rules     enable row level security;
alter table public.rule_templates     enable row level security;
alter table public.opt_outs           enable row level security;
alter table public.message_jobs       enable row level security;
alter table public.push_subscriptions enable row level security;

alter table public.messaging_settings force row level security;
alter table public.message_templates  force row level security;
alter table public.reminder_rules     force row level security;
alter table public.rule_templates     force row level security;
alter table public.opt_outs           force row level security;
alter table public.message_jobs       force row level security;
alter table public.push_subscriptions force row level security;

-- Quién le escribe a la clientela y cuánto se gasta es una decisión de
-- negocio: la toman owner y admin. El resto del equipo lo ve pero no lo toca.

create policy "messaging_settings: ver"
  on public.messaging_settings for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "messaging_settings: editar si owner o admin"
  on public.messaging_settings for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "message_templates: ver"
  on public.message_templates for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "message_templates: crear si owner o admin"
  on public.message_templates for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );
create policy "message_templates: editar si owner o admin"
  on public.message_templates for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );
create policy "message_templates: borrar si owner o admin"
  on public.message_templates for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "reminder_rules: ver"
  on public.reminder_rules for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "reminder_rules: crear si owner o admin"
  on public.reminder_rules for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );
create policy "reminder_rules: editar si owner o admin"
  on public.reminder_rules for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );
create policy "reminder_rules: borrar si owner o admin"
  on public.reminder_rules for delete to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

create policy "rule_templates: ver"
  on public.rule_templates for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "rule_templates: escribir si owner o admin"
  on public.rule_templates for all to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin')) );

-- Dar de baja a alguien lo puede hacer cualquiera del equipo: si una clienta
-- pide que no le escriban más, quien la atiende tiene que poder resolverlo en
-- el momento.
create policy "opt_outs: ver"
  on public.opt_outs for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "opt_outs: dar de baja"
  on public.opt_outs for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );
create policy "opt_outs: rehabilitar"
  on public.opt_outs for delete to authenticated
  using ( (select app.has_tenant(tenant_id)) );

-- La cola se lee entera pero no se escribe a mano: la llenan el planificador
-- y el emisor, que corren con permisos del sistema.
create policy "message_jobs: ver"
  on public.message_jobs for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
-- Cancelar un envío que todavía no salió sí es una acción de la interfaz.
create policy "message_jobs: cancelar"
  on public.message_jobs for update to authenticated
  using      ( (select app.has_tenant(tenant_id)) )
  with check ( (select app.has_tenant(tenant_id)) );

create policy "push_subscriptions: ver"
  on public.push_subscriptions for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
create policy "push_subscriptions: registrar"
  on public.push_subscriptions for insert to authenticated
  with check ( (select app.has_tenant(tenant_id)) );
create policy "push_subscriptions: borrar"
  on public.push_subscriptions for delete to authenticated
  using ( (select app.has_tenant(tenant_id)) );

revoke all on
  public.messaging_settings, public.message_templates, public.reminder_rules,
  public.rule_templates, public.opt_outs, public.message_jobs,
  public.push_subscriptions
  from anon, authenticated;

grant select,         update         on public.messaging_settings to authenticated;
grant select, insert, update, delete on public.message_templates  to authenticated;
grant select, insert, update, delete on public.reminder_rules     to authenticated;
grant select, insert, update, delete on public.rule_templates     to authenticated;
grant select, insert,         delete on public.opt_outs           to authenticated;
grant select,         update         on public.message_jobs       to authenticated;
grant select, insert,         delete on public.push_subscriptions to authenticated;

revoke all on function app.plan_reminders(interval) from public;
revoke all on function app.claim_due_jobs(integer)  from public;
grant execute on function app.plan_reminders(interval) to service_role;
grant execute on function app.claim_due_jobs(integer)  to service_role;
grant execute on function app.resolve_channel(uuid, public.message_channel[]) to authenticated, service_role;
