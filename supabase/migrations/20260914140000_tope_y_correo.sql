-- ============================================================================
-- Dlay Agenda · El tope de gasto, y el correo como función futura
--
-- Dos cosas que van juntas porque las dos son sobre plata.
--
-- EL TOPE. El campo `monthly_budget_cents` existía desde el primer día y no lo
-- miraba nadie. Era el cinturón de seguridad sin abrochar: una regla mal
-- configurada, una importación que crea quinientos turnos, y la factura de
-- Meta se dispara sin que nada la frene.
--
-- Con una decisión que importa: el tope frena SÓLO lo que cuesta. Las
-- notificaciones siguen saliendo aunque se haya gastado todo el mes. Un tope
-- de plata que apaga los canales gratis no protege nada, sólo deja a alguien
-- sin avisar.
--
-- EL CORREO. Está entero y funciona, pero todavía no hay proveedor
-- configurado, y el primer negocio que va a usar esto dice que sus clientes no
-- usan correo. Ofrecer un canal que no puede entregar es peor que no
-- ofrecerlo: se elige, no llega, y nadie entiende por qué.
--
-- Así que nace apagado POR NEGOCIO y no para toda la plataforma. Un
-- interruptor global tendría que ser el mismo para todos, y esto no es una
-- verdad de la plataforma sino una decisión de cada negocio: hay clientelas
-- que viven en el correo y otras que no lo abren nunca.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El correo, apagado hasta que cada negocio lo quiera
-- ---------------------------------------------------------------------------
alter table public.messaging_settings
  add column email_enabled boolean not null default false;

comment on column public.messaging_settings.email_enabled is
  'Si este negocio usa el correo como canal. Nace apagado: hasta que haya '
  'proveedor de correo configurado no se puede entregar, y ofrecer un canal '
  'que no entrega es peor que no ofrecerlo.';

-- ---------------------------------------------------------------------------
-- 2. La cascada saltea el correo si el negocio no lo usa
-- ---------------------------------------------------------------------------
-- Se decide acá, en el único lugar por donde pasan todos los envíos, y no
-- sacándolo del orden de cada regla. Así las reglas que ya existen no hay que
-- tocarlas, y el día que se prenda el correo vuelven a usarlo solas.
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
  v_email  boolean;
begin
  select * into v_client from public.clients c where c.id = p_client;
  if not found or not v_client.is_active then
    return null;
  end if;

  select coalesce(ms.email_enabled, false) into v_email
  from public.messaging_settings ms
  where ms.tenant_id = v_client.tenant_id;

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
    elsif v_ch = 'email' and coalesce(v_email, false)
          and v_client.email is not null then
      return v_ch;
    elsif v_ch = 'whatsapp' and v_client.phone_e164 is not null then
      return v_ch;
    end if;
  end loop;

  return null;
end;
$$;

comment on function app.resolve_channel(uuid, public.message_channel[]) is
  'El canal más barato que esa persona pueda recibir. Saltea el correo si el '
  'negocio no lo tiene activado.';

-- ---------------------------------------------------------------------------
-- 3. El tope de gasto del mes
-- ---------------------------------------------------------------------------
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

    -- El tope de plata frena sólo lo que cuesta. Una notificación no gasta
    -- nada, así que sigue saliendo aunque el mes esté agotado: si no, un tope
    -- de gasto terminaría dejando a alguien sin avisar por ahorrar cero.
    if v_budget is not null and coalesce(j.cost_cents, 0) > 0 then
      -- El mes es el del negocio, no el del UTC: en Argentina el primero
      -- empieza tres horas antes y el tope se reiniciaría de madrugada el día
      -- anterior.
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
  'Toma envíos vencidos respetando los topes por persona y el de plata del '
  'mes. El tope de plata no frena los canales gratis.';

-- ---------------------------------------------------------------------------
-- 4. Un tope por defecto, para que nadie empiece sin red
-- ---------------------------------------------------------------------------
-- Nulo significa «sin límite», y nadie elige un límite antes de necesitarlo.
-- Veinte mil pesos alcanzan para unos quinientos recordatorios por WhatsApp:
-- de sobra para un mes normal, y un freno si algo se descontrola.
alter table public.messaging_settings
  alter column monthly_budget_cents set default 2000000;

update public.messaging_settings
set monthly_budget_cents = 2000000
where monthly_budget_cents is null;

comment on column public.messaging_settings.monthly_budget_cents is
  'Tope de gasto del mes en centavos. Nulo es sin límite. Frena sólo los '
  'canales que cuestan: las notificaciones salen igual.';
