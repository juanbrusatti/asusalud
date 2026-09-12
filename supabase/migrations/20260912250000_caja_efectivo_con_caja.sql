-- ============================================================================
-- Dlay Estética · El efectivo necesita una caja abierta
--
-- Cobrar desde la pantalla del turno hizo evidente un hueco: un movimiento en
-- efectivo sin sesión no entra en ningún arqueo y no aparece en ninguna
-- pantalla. Es plata que quedó guardada y perdida a la vez.
--
-- La aplicación ya lo impedía, pero una regla de la caja tiene que vivir en la
-- base, como la inmutabilidad de los movimientos. Lo que no es efectivo sigue
-- pudiendo registrarse sin caja: una transferencia no pasa por el cajón.
-- ============================================================================

alter table public.cash_movements
  add constraint cash_movements_cash_needs_session
  check (method <> 'cash' or session_id is not null);

comment on constraint cash_movements_cash_needs_session on public.cash_movements is
  'El efectivo sólo existe dentro de una caja abierta: si no, no hay dónde '
  'contarlo al cerrar el día.';
