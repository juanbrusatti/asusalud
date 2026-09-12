-- ============================================================================
-- Dlay Estética · El arqueo queda guardado
--
-- Sin esto, una caja cerrada sabe cuánto se contó pero no cuánto debería
-- haber: el dato se calculaba al vuelo y se perdía. Y es justamente el número
-- que importa para mirar el mes hacia atrás y ver si la caja cuadra siempre,
-- nunca, o sólo los sábados.
-- ============================================================================

alter table public.cash_sessions
  add column expected_cents   bigint,
  add column difference_cents bigint;

comment on column public.cash_sessions.difference_cents is
  'Contado menos esperado. Negativo es que faltaba plata en el cajón.';

-- Se completan al cerrar, junto con el conteo.
update public.cash_sessions
set expected_cents = 0, difference_cents = counted_cents
where closed_at is not null and expected_cents is null;

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
  set counted_cents    = p_counted_cents,
      expected_cents   = v_expected,
      difference_cents = p_counted_cents - v_expected,
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

revoke all on function public.cash_close_session(uuid, bigint, text) from public;
grant execute on function public.cash_close_session(uuid, bigint, text) to authenticated;
