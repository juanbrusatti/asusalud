-- ============================================================================
-- Dlay Estética · Caja
--
-- Lo que hoy Asusalud no tiene: TuTurno lo deja detrás del plan Empresa, así
-- que llevan la plata en un cuaderno.
--
-- Tres decisiones que definen todo:
--
--   1. LOS MOVIMIENTOS NO SE EDITAN NI SE BORRAN. Un error se corrige con un
--      contramovimiento, igual que en cualquier libro contable. Una caja que
--      se puede editar hacia atrás no sirve para cerrar el día, porque nunca
--      se sabe si lo que dice hoy es lo que decía ayer.
--
--   2. EL ARQUEO CUENTA SOLO EL EFECTIVO. Una transferencia es un ingreso
--      real, pero no está en el cajón. Mezclarlas hace que el cierre nunca dé
--      y que se deje de confiar en el número.
--
--   3. UNA SOLA CAJA ABIERTA POR SUCURSAL. Dos sesiones abiertas a la vez
--      significan que nadie sabe dónde cae cada cobro.
-- ============================================================================

create type public.payment_method as enum (
  'cash',          -- efectivo: lo único que entra en el arqueo
  'transfer',      -- transferencia
  'debit',
  'credit',
  'mercadopago',
  'other'
);

create type public.movement_kind as enum ('income', 'expense');

-- ---------------------------------------------------------------------------
-- cash_sessions · la caja del día
-- ---------------------------------------------------------------------------
create table public.cash_sessions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  branch_id      uuid not null references public.branches (id) on delete cascade,

  -- Con cuánto efectivo se arranca el día.
  opening_cents  bigint not null default 0,
  opened_at      timestamptz not null default now(),
  opened_by      uuid references public.profiles (id) on delete set null,

  -- Lo que se contó al cerrar. Null mientras sigue abierta.
  counted_cents  bigint,
  closed_at      timestamptz,
  closed_by      uuid references public.profiles (id) on delete set null,

  notes          text,

  constraint cash_sessions_opening_nonneg check (opening_cents >= 0),
  constraint cash_sessions_counted_nonneg check (counted_cents is null or counted_cents >= 0),
  -- Cerrada significa las dos cosas juntas: fecha y conteo.
  constraint cash_sessions_close_coherent check (
    (closed_at is null) = (counted_cents is null)
  ),
  constraint cash_sessions_notes_len check (notes is null or char_length(notes) <= 500)
);

-- Una sola caja abierta por sucursal.
create unique index cash_sessions_one_open
  on public.cash_sessions (branch_id) where closed_at is null;
create index cash_sessions_tenant_idx
  on public.cash_sessions (tenant_id, opened_at desc);

comment on table public.cash_sessions is
  'Una fila por apertura de caja. El arqueo sale de comparar lo contado con lo '
  'que debería haber según los movimientos en efectivo.';

-- ---------------------------------------------------------------------------
-- cash_movements · cada entrada y salida
-- ---------------------------------------------------------------------------
create table public.cash_movements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  branch_id      uuid not null references public.branches (id) on delete cascade,
  -- Null para lo que no pasa por el cajón: un cobro online, por ejemplo.
  session_id     uuid references public.cash_sessions (id) on delete restrict,

  kind           public.movement_kind not null,
  method         public.payment_method not null default 'cash',
  -- Siempre positivo. El signo lo da `kind`: guardar negativos invita a
  -- sumarlos mal en cualquier consulta futura.
  amount_cents   bigint not null,

  concept        text not null,
  appointment_id uuid references public.appointments (id) on delete set null,
  client_id      uuid references public.clients (id) on delete set null,

  -- Si este movimiento anula a otro, acá está cuál.
  reverses_id    uuid references public.cash_movements (id) on delete restrict,

  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint cash_movements_amount_positive check (amount_cents > 0),
  constraint cash_movements_concept_len
    check (char_length(trim(concept)) between 2 and 200)
);

create index cash_movements_session_idx
  on public.cash_movements (session_id, created_at);
create index cash_movements_tenant_idx
  on public.cash_movements (tenant_id, created_at desc);
create index cash_movements_appointment_idx
  on public.cash_movements (appointment_id) where appointment_id is not null;
-- Un movimiento se anula una sola vez.
create unique index cash_movements_reverses_key
  on public.cash_movements (reverses_id) where reverses_id is not null;

comment on table public.cash_movements is
  'Append-only. No se edita ni se borra: un error se corrige con un '
  'contramovimiento, como en cualquier libro contable.';

-- ---------------------------------------------------------------------------
-- Inmutabilidad
-- ---------------------------------------------------------------------------
-- No alcanza con no poner el botón en la pantalla: si la tabla admite UPDATE,
-- tarde o temprano alguien escribe el UPDATE.
create or replace function app.block_movement_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Excepción única: dar de baja una estética entera. El borrado en cascada de
  -- su caja es esperado, y la fila padre ya no existe cuando corre la cascada.
  -- Sin esto, una estética con un solo cobro registrado no se podría eliminar
  -- nunca.
  if tg_op = 'DELETE'
     and not exists (
       select 1 from public.tenants t where t.id = old.tenant_id
     ) then
    return old;
  end if;

  raise exception
    'Los movimientos de caja no se editan ni se borran. Para corregir uno, anulalo.'
    using errcode = '42501';
end;
$$;

create trigger cash_movements_immutable
  before update or delete on public.cash_movements
  for each row execute function app.block_movement_changes();

-- Tampoco se agrega nada a una caja ya cerrada: el cierre quedaría mintiendo.
create or replace function app.guard_closed_session()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.session_id is not null and exists (
    select 1 from public.cash_sessions cs
    where cs.id = new.session_id and cs.closed_at is not null
  ) then
    raise exception 'Esa caja ya está cerrada. Abrí una nueva para seguir cobrando.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger cash_movements_guard_closed
  before insert on public.cash_movements
  for each row execute function app.guard_closed_session();

-- Una caja cerrada no se reabre: se abre otra.
create or replace function app.guard_session_reopen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.closed_at is not null then
    raise exception 'Una caja cerrada no se puede modificar.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger cash_sessions_no_reopen
  before update on public.cash_sessions
  for each row execute function app.guard_session_reopen();

-- ============================================================================
-- Abrir, cobrar, anular y cerrar
-- ============================================================================

-- Cuánto efectivo debería haber en el cajón según los movimientos.
-- Sólo cuenta el efectivo: una transferencia es un ingreso real pero no está
-- ahí adentro.
create or replace function app.session_expected_cents(p_session uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(cs.opening_cents, 0) + coalesce((
    select sum(case when cm.kind = 'income' then cm.amount_cents else -cm.amount_cents end)
    from public.cash_movements cm
    where cm.session_id = p_session and cm.method = 'cash'
  ), 0)
  from public.cash_sessions cs
  where cs.id = p_session;
$$;

grant execute on function app.session_expected_cents(uuid) to authenticated;

create or replace function public.cash_open_session(p_opening_cents bigint default 0)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_branch uuid;
  v_tenant uuid;
  v_id     uuid;
begin
  select b.id, b.tenant_id into v_branch, v_tenant
  from public.branches b
  where b.is_default
  limit 1;

  if v_branch is null then
    raise exception 'No encontramos tu sucursal.' using errcode = '42501';
  end if;

  insert into public.cash_sessions (tenant_id, branch_id, opening_cents, opened_by)
  values (v_tenant, v_branch, greatest(coalesce(p_opening_cents, 0), 0), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * Cierra la caja con lo que se contó.
 *
 * Devuelve el arqueo: lo esperado, lo contado y la diferencia. Esa diferencia
 * es el dato que importa del día, y por eso se calcula del lado de la base y
 * no en la pantalla: es el mismo número para todos.
 */
create or replace function public.cash_close_session(
  p_session uuid,
  p_counted_cents bigint,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected bigint;
begin
  if p_counted_cents is null or p_counted_cents < 0 then
    raise exception 'Poné cuánto efectivo contaste.' using errcode = '23514';
  end if;

  v_expected := app.session_expected_cents(p_session);

  update public.cash_sessions
  set counted_cents = p_counted_cents,
      closed_at = now(),
      closed_by = (select auth.uid()),
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_session and closed_at is null;

  if not found then
    raise exception 'Esa caja ya está cerrada.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'expectedCents', v_expected,
    'countedCents', p_counted_cents,
    'differenceCents', p_counted_cents - v_expected
  );
end;
$$;

/**
 * Anula un movimiento creando su contrario.
 *
 * No se borra el original: quedan los dos, y el total da cero. Así el día
 * sigue siendo auditable y se ve que hubo una corrección, no que algo
 * desapareció.
 */
create or replace function public.cash_reverse_movement(
  p_movement uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_orig public.cash_movements;
  v_id   uuid;
begin
  select * into v_orig from public.cash_movements where id = p_movement;

  if not found then
    raise exception 'Ese movimiento no existe.' using errcode = '42501';
  end if;

  if v_orig.reverses_id is not null then
    raise exception 'Ese movimiento ya es la anulación de otro.' using errcode = '23514';
  end if;

  if exists (select 1 from public.cash_movements where reverses_id = p_movement) then
    raise exception 'Ese movimiento ya fue anulado.' using errcode = '23505';
  end if;

  insert into public.cash_movements (
    tenant_id, branch_id, session_id, kind, method, amount_cents,
    concept, appointment_id, client_id, reverses_id, created_by
  )
  values (
    v_orig.tenant_id, v_orig.branch_id, v_orig.session_id,
    -- Lo contrario: un ingreso se anula con un egreso.
    case v_orig.kind when 'income' then 'expense' else 'income' end::public.movement_kind,
    v_orig.method, v_orig.amount_cents,
    'Anulación: ' || v_orig.concept ||
      coalesce(' · ' || nullif(trim(coalesce(p_reason, '')), ''), ''),
    v_orig.appointment_id, v_orig.client_id, p_movement, (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cuánto se cobró de un turno
-- ---------------------------------------------------------------------------
-- Los cobros anulados no cuentan, y tampoco las anulaciones en sí. De acá sale
-- el saldo que se muestra al cobrar.
create or replace function public.appointment_paid_cents(p_appointment uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    case when cm.kind = 'income' then cm.amount_cents else -cm.amount_cents end
  ), 0)
  from public.cash_movements cm
  where cm.appointment_id = p_appointment;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cash_sessions  enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_sessions  force row level security;
alter table public.cash_movements force row level security;

-- La caja la manejan quienes atienden el mostrador: dueña, administración y
-- recepción. Una profesional no ve la plata de la estética.

create policy "cash_sessions: ver"
  on public.cash_sessions for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin', 'reception')) );

create policy "cash_sessions: abrir"
  on public.cash_sessions for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin', 'reception')) );

create policy "cash_sessions: cerrar"
  on public.cash_sessions for update to authenticated
  using      ( (select app.has_role(tenant_id, 'owner', 'admin', 'reception')) )
  with check ( (select app.has_role(tenant_id, 'owner', 'admin', 'reception')) );

create policy "cash_movements: ver"
  on public.cash_movements for select to authenticated
  using ( (select app.has_role(tenant_id, 'owner', 'admin', 'reception')) );

create policy "cash_movements: registrar"
  on public.cash_movements for insert to authenticated
  with check ( (select app.has_role(tenant_id, 'owner', 'admin', 'reception')) );

-- Sin UPDATE ni DELETE para nadie: los movimientos son inmutables y el trigger
-- lo hace cumplir, pero tampoco se otorga el permiso.
revoke all on public.cash_sessions, public.cash_movements from anon, authenticated;
grant select, insert, update on public.cash_sessions  to authenticated;
grant select, insert         on public.cash_movements to authenticated;

revoke all on function public.cash_open_session(bigint) from public;
revoke all on function public.cash_close_session(uuid, bigint, text) from public;
revoke all on function public.cash_reverse_movement(uuid, text) from public;
revoke all on function public.appointment_paid_cents(uuid) from public;

grant execute on function public.cash_open_session(bigint) to authenticated;
grant execute on function public.cash_close_session(uuid, bigint, text) to authenticated;
grant execute on function public.cash_reverse_movement(uuid, text) to authenticated;
grant execute on function public.appointment_paid_cents(uuid) to authenticated;
