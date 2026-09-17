-- ============================================================================
-- Dlay Agenda · Tu cuenta y el panel de la plataforma
--
-- Dlay se cobra por turno que ocurrió: si el negocio atendió, se cobra; si no,
-- no. Eso ata lo que paga a lo que gana, y hace que un mes flojo salga barato.
--
-- Dos decisiones que explican todo lo demás:
--
-- · **No hay un contador que se suma y se resta.** Lo que se debe se calcula
--   sobre los turnos cada vez que alguien pregunta. Un número guardado que se
--   toca a mano no se puede auditar: el día que quede mal, nadie va a saber
--   cuándo se desvió. Lo único que se guarda es el pago, y al guardarlo se
--   congela el precio de ese mes, así una suba futura no reescribe el pasado.
--
-- · **No se cobra por `attended`.** El estado existe en el enum pero no lo
--   escribe nadie: los turnos quedan en `pending` o `confirmed` para siempre.
--   Facturar por ahí daría cero todos los meses sin que nada avise. Y aunque
--   alguien lo marcara, sería un botón que cuesta plata, que es la mejor forma
--   de que la gente deje de apretarlo. Se cobra por turno que ya ocurrió y no
--   se canceló, que no lo aprieta nadie: lo decide el reloj.
--
-- Los cancelados y los ausentes no se cobran. El negocio no ganó nada con
-- ellos y cobrarlos es la clase de cuenta que rompe una relación.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- El precio de cada negocio
-- ---------------------------------------------------------------------------
create table public.billing_settings (
  tenant_id   uuid primary key references public.tenants (id) on delete cascade,

  -- En centavos, como toda la plata del sistema. $300 por turno.
  price_cents bigint not null default 30000
                check (price_cents >= 0),

  updated_at  timestamptz not null default now()
);

comment on table public.billing_settings is
  'Lo que Dlay le cobra a este negocio por cada turno que ocurre. Existe por '
  'negocio porque no todos van a pagar lo mismo.';

alter table public.billing_settings enable row level security;
alter table public.billing_settings force row level security;

-- El negocio ve su precio: es lo que le vamos a cobrar, esconderlo no tendría
-- sentido. Escribirlo es de la plataforma, y pasa por una función.
create policy "billing_settings: ver el propio"
  on public.billing_settings for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.billing_settings from anon, authenticated;
grant select on public.billing_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Quién es de la plataforma
-- ---------------------------------------------------------------------------
-- Una tabla sin ninguna política: nadie la lee desde el navegador, ni siquiera
-- quien está en ella. La consulta una sola función, que corre con permisos del
-- sistema. Es el mismo criterio que las credenciales de WhatsApp.
create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.platform_admins is
  'Las personas de Dlay que pueden ver el panel de la plataforma. Se cargan a '
  'mano con scripts/plataforma-admin.sh; no hay forma de darse de alta solo.';

alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

comment on function app.is_platform_admin() is
  '¿Quien consulta es de Dlay? Es la única puerta al panel de la plataforma, '
  'que ve todos los negocios y por eso no puede depender de ninguna política.';

-- ---------------------------------------------------------------------------
-- Los pagos
-- ---------------------------------------------------------------------------
-- Que exista una fila es lo que significa «pagado». No hay estado que
-- mantener ni que sincronizar con nada.
create table public.billing_payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,

  -- El primer día del mes cobrado, en la zona del negocio.
  period        date not null,

  -- Congelados al cobrar. Si mañana sube el precio, este mes no se mueve.
  appointments  integer not null check (appointments >= 0),
  price_cents   bigint  not null check (price_cents >= 0),
  amount_cents  bigint  not null check (amount_cents >= 0),

  paid_at       timestamptz not null default now(),
  note          text,
  created_by    uuid references auth.users (id) on delete set null,

  constraint billing_payments_period_key unique (tenant_id, period),
  constraint billing_payments_period_is_month check (period = date_trunc('month', period)::date),
  constraint billing_payments_note_len check (note is null or char_length(note) <= 500)
);

comment on table public.billing_payments is
  'Un mes cobrado. La fila se crea cuando alguien de Dlay marca el pago, y '
  'guarda la cantidad y el precio de ese momento para que el histórico no '
  'cambie nunca.';

create index billing_payments_tenant_idx
  on public.billing_payments (tenant_id, period desc);

alter table public.billing_payments enable row level security;
alter table public.billing_payments force row level security;

-- El negocio ve sus propios pagos: es su historial, y necesita poder mirarlo
-- para saber qué meses ya saldó.
create policy "billing_payments: ver los propios"
  on public.billing_payments for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin')) );

revoke all on public.billing_payments from anon, authenticated;
grant select on public.billing_payments to authenticated;

-- ---------------------------------------------------------------------------
-- Los meses con turnos cobrables
-- ---------------------------------------------------------------------------
-- El corazón del cálculo, en un solo lugar: lo usan tanto la pantalla del
-- negocio como el panel de la plataforma. Si algún día cambia qué se cobra,
-- cambia acá y los dos lados quedan de acuerdo. Que estén separados es cómo
-- se termina cobrando un número distinto del que se muestra.
create or replace function app.billable_periods(p_tenant uuid)
returns table (period date, cantidad integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    date_trunc('month', (a.starts_at at time zone t.timezone))::date as period,
    count(*)::integer
  from public.appointments a
  join public.tenants t on t.id = a.tenant_id
  where a.tenant_id = p_tenant
    -- Ya pasó. No se cobra por adelantado.
    and a.starts_at < now()
    and a.status not in ('cancelled', 'no_show')
  group by 1;
$$;

comment on function app.billable_periods(uuid) is
  'Cuántos turnos cobrables tuvo cada mes: los que ya ocurrieron y no se '
  'cancelaron, agrupados por el mes del negocio y no por el del UTC.';

-- ---------------------------------------------------------------------------
-- Tu cuenta, para el negocio
-- ---------------------------------------------------------------------------
create or replace function public.account_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_tz     text;
  v_price  bigint;
  v_mes    date;
  v_cant   integer;
begin
  -- La RLS de `tenants` ya deja ver solamente el negocio propio.
  select t.id, t.timezone into v_tenant, v_tz
  from public.tenants t
  limit 1;

  if v_tenant is null then
    return null;
  end if;

  -- Lo que el negocio le paga a Dlay es de quien lo dirige. Quien atiende no
  -- tiene por qué ver la factura, igual que no ve la caja.
  if not (select app.has_role(v_tenant, 'owner', 'admin')) then
    raise exception 'Sólo la dueña o administración pueden ver la cuenta.'
      using errcode = '42501';
  end if;

  select bs.price_cents into v_price
  from public.billing_settings bs
  where bs.tenant_id = v_tenant;

  v_price := coalesce(v_price, 30000);
  v_mes   := date_trunc('month', (now() at time zone v_tz))::date;

  select coalesce(bp.cantidad, 0) into v_cant
  from app.billable_periods(v_tenant) bp
  where bp.period = v_mes;

  v_cant := coalesce(v_cant, 0);

  return jsonb_build_object(
    'precio_cents', v_price,
    'mes_actual', jsonb_build_object(
      'periodo',     v_mes,
      'cantidad',    v_cant,
      'total_cents', v_cant * v_price
    ),
    'meses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'periodo',     bp.period,
          'cantidad',    coalesce(pg.appointments, bp.cantidad),
          -- Para un mes ya cobrado vale lo que se cobró, no lo que valdría hoy.
          'total_cents', coalesce(pg.amount_cents, bp.cantidad * v_price),
          'pagado',      pg.id is not null,
          'pagado_el',   pg.paid_at
        )
        order by bp.period desc
      )
      from app.billable_periods(v_tenant) bp
      left join public.billing_payments pg
        on pg.tenant_id = v_tenant and pg.period = bp.period
      where bp.period < v_mes
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.account_summary() is
  'Lo que este negocio lleva gastado: el mes en curso y el detalle de los '
  'meses cerrados, con cuáles ya pagó.';

revoke all on function public.account_summary() from public, anon;
grant execute on function public.account_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- El panel de la plataforma
-- ---------------------------------------------------------------------------
create or replace function public.platform_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(fila order by fila->>'nombre'), '[]'::jsonb)
  into v_out
  from (
    select jsonb_build_object(
      'tenant_id',    t.id,
      'nombre',       t.name,
      'slug',         t.slug,
      'estado',       t.status,
      'creado',       t.created_at,
      'precio_cents', coalesce(bs.price_cents, 30000),
      'mes_actual', jsonb_build_object(
        'periodo',     mes.valor,
        'cantidad',    coalesce(curso.cantidad, 0),
        'total_cents', coalesce(curso.cantidad, 0) * coalesce(bs.price_cents, 30000)
      ),
      'pendientes',            coalesce(deuda.lista, '[]'::jsonb),
      'pendiente_total_cents', coalesce(deuda.total, 0),
      'ultimo_pago',           ultimo.info
    ) as fila
    from public.tenants t
    left join public.billing_settings bs on bs.tenant_id = t.id

    cross join lateral (
      select date_trunc('month', (now() at time zone t.timezone))::date as valor
    ) mes

    left join lateral (
      select bp.cantidad
      from app.billable_periods(t.id) bp
      where bp.period = mes.valor
    ) curso on true

    -- Los meses cerrados que todavía nadie marcó como pagados.
    left join lateral (
      select
        jsonb_agg(
          jsonb_build_object(
            'periodo',     bp.period,
            'cantidad',    bp.cantidad,
            'total_cents', bp.cantidad * coalesce(bs.price_cents, 30000)
          )
          order by bp.period desc
        ) as lista,
        sum(bp.cantidad * coalesce(bs.price_cents, 30000)) as total
      from app.billable_periods(t.id) bp
      left join public.billing_payments pg
        on pg.tenant_id = t.id and pg.period = bp.period
      where bp.period < mes.valor
        and pg.id is null
    ) deuda on true

    left join lateral (
      select jsonb_build_object(
        'periodo',      pg.period,
        'monto_cents',  pg.amount_cents,
        'fecha',        pg.paid_at
      ) as info
      from public.billing_payments pg
      where pg.tenant_id = t.id
      order by pg.period desc
      limit 1
    ) ultimo on true
  ) s;

  return v_out;
end;
$$;

comment on function public.platform_accounts() is
  'Todos los negocios con lo que llevan del mes y lo que deben. Sólo para '
  'quien esté en platform_admins.';

revoke all on function public.platform_accounts() from public, anon;
grant execute on function public.platform_accounts() to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar un mes como pagado
-- ---------------------------------------------------------------------------
create or replace function public.platform_mark_paid(
  p_tenant uuid,
  p_period date,
  p_note   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_mes   date;
  v_cant  integer;
  v_price bigint;
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  select t.timezone into v_tz from public.tenants t where t.id = p_tenant;
  if v_tz is null then
    return jsonb_build_object('ok', false, 'error', 'No existe ese negocio.');
  end if;

  p_period := date_trunc('month', p_period)::date;
  v_mes    := date_trunc('month', (now() at time zone v_tz))::date;

  -- El mes en curso no se cobra: todavía le pueden entrar turnos.
  if p_period >= v_mes then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese mes todavía no terminó. Se cobra cuando cierra.'
    );
  end if;

  select bp.cantidad into v_cant
  from app.billable_periods(p_tenant) bp
  where bp.period = p_period;

  if coalesce(v_cant, 0) = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ese mes no tuvo turnos para cobrar.'
    );
  end if;

  select coalesce(bs.price_cents, 30000) into v_price
  from public.tenants t
  left join public.billing_settings bs on bs.tenant_id = t.id
  where t.id = p_tenant;

  insert into public.billing_payments
    (tenant_id, period, appointments, price_cents, amount_cents, note, created_by)
  values
    (p_tenant, p_period, v_cant, v_price, v_cant * v_price, nullif(btrim(p_note), ''),
     (select auth.uid()))
  on conflict (tenant_id, period) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese mes ya figuraba pagado.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'periodo', p_period,
    'cantidad', v_cant,
    'total_cents', v_cant * v_price
  );
end;
$$;

comment on function public.platform_mark_paid(uuid, date, text) is
  'Deja registrado que un negocio pagó un mes, congelando cuántos turnos y a '
  'qué precio. No deja marcar el mes en curso ni cobrar dos veces el mismo.';

revoke all on function public.platform_mark_paid(uuid, date, text) from public, anon;
grant execute on function public.platform_mark_paid(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deshacer un pago mal marcado
-- ---------------------------------------------------------------------------
-- Marcar el mes equivocado a las once de la noche es cuestión de tiempo, y sin
-- esto habría que entrar a la base a arreglarlo.
create or replace function public.platform_unmark_paid(
  p_tenant uuid,
  p_period date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  delete from public.billing_payments
  where tenant_id = p_tenant
    and period = date_trunc('month', p_period)::date;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese mes no figuraba pagado.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.platform_unmark_paid(uuid, date) from public, anon;
grant execute on function public.platform_unmark_paid(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Cambiar el precio de un negocio
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_price(
  p_tenant uuid,
  p_price_cents bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select app.is_platform_admin()) then
    raise exception 'Esto es del panel de Dlay.' using errcode = '42501';
  end if;

  if p_price_cents is null or p_price_cents < 0 then
    return jsonb_build_object('ok', false, 'error', 'El precio no puede ser negativo.');
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    return jsonb_build_object('ok', false, 'error', 'No existe ese negocio.');
  end if;

  insert into public.billing_settings (tenant_id, price_cents, updated_at)
  values (p_tenant, p_price_cents, now())
  on conflict (tenant_id) do update
    set price_cents = excluded.price_cents,
        updated_at  = now();

  return jsonb_build_object('ok', true, 'precio_cents', p_price_cents);
end;
$$;

comment on function public.platform_set_price(uuid, bigint) is
  'Cambia lo que se le cobra a un negocio por turno. Los meses ya cobrados no '
  'se tocan: guardaron su precio al pagarse.';

revoke all on function public.platform_set_price(uuid, bigint) from public, anon;
grant execute on function public.platform_set_price(uuid, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Dar y quitar el acceso al panel
-- ---------------------------------------------------------------------------
-- Sólo para `service_role`, o sea desde scripts/plataforma-admin.sh con la
-- clave del servidor. Que nadie pueda hacerse admin desde el navegador es la
-- única razón por la que esta tabla se puede dejar sin políticas.
create or replace function public.rpc_platform_admin_add(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(btrim(p_email));

  if v_user is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'No hay ninguna cuenta con ese correo. Tiene que entrar al sistema al menos una vez.'
    );
  end if;

  insert into public.platform_admins (user_id, note)
  values (v_user, btrim(p_email))
  on conflict (user_id) do nothing;

  return jsonb_build_object('ok', true, 'user_id', v_user);
end;
$$;

revoke all on function public.rpc_platform_admin_add(text)
  from public, anon, authenticated;
grant execute on function public.rpc_platform_admin_add(text) to service_role;

create or replace function public.rpc_platform_admin_remove(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.platform_admins pa
  using auth.users u
  where u.id = pa.user_id
    and lower(u.email) = lower(btrim(p_email));

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ese correo no estaba en el panel.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.rpc_platform_admin_remove(text)
  from public, anon, authenticated;
grant execute on function public.rpc_platform_admin_remove(text) to service_role;
