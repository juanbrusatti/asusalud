-- ============================================================================
-- Dlay Estética · Total esperado, accesible desde la aplicación
--
-- `app.session_expected_cents` vive en el esquema privado, que la API no
-- expone. La pantalla de caja necesita ese número, así que se publica un
-- envoltorio que respeta la RLS: sólo devuelve algo para una caja que quien
-- pregunta puede ver.
-- ============================================================================

create or replace function public.session_expected_cents_public(p_session uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(cs.opening_cents, 0) + coalesce((
    select sum(case when cm.kind = 'income' then cm.amount_cents else -cm.amount_cents end)
    from public.cash_movements cm
    where cm.session_id = cs.id and cm.method = 'cash'
  ), 0)
  from public.cash_sessions cs
  where cs.id = p_session;
$$;

revoke all on function public.session_expected_cents_public(uuid) from public;
grant execute on function public.session_expected_cents_public(uuid) to authenticated;
