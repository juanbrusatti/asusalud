-- ============================================================================
-- Dlay Agenda · Mover un turno, y que quede dicho
--
-- Mover un turno ya se podía —el cliente lo hace desde su enlace, y la acción
-- del equipo estaba escrita— pero del lado del mostrador no había botón, y
-- sobre todo no quedaba rastro: un turno movido tres veces se veía igual que
-- uno que nunca se tocó.
--
-- El registro lo lleva un disparador y no cada función que mueve turnos. Hoy
-- son dos caminos —el enlace del cliente y el mostrador—, mañana pueden ser
-- tres, y con la cuenta repartida siempre hay uno que se olvida de sumar. El
-- disparador mira lo único que importa: que la hora haya cambiado.
--
-- `rescheduled_count` no sirve para esto y se deja como está: es el cupo de
-- movimientos del CLIENTE, y si lo tocara el mostrador, mover un turno desde
-- el negocio le gastaría al cliente un cambio que no pidió.
-- ============================================================================

alter table public.appointments
  add column moved_count integer not null default 0 check (moved_count >= 0),
  add column moved_at timestamptz,
  -- La hora que tenía la primera vez. Sirve para poder decir «era el 12/08 a
  -- las 10:00», que es lo que alguien quiere saber cuando ve la etiqueta.
  add column original_starts_at timestamptz;

comment on column public.appointments.moved_count is
  'Cuántas veces se movió de horario, lo haya movido quien lo haya movido. '
  'Distinto de rescheduled_count, que es el cupo del cliente.';

create or replace function app.record_appointment_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.moved_count        := old.moved_count + 1;
    new.moved_at           := now();
    -- Sólo la primera vez: lo que interesa es de dónde salió, no el paso
    -- anterior.
    new.original_starts_at := coalesce(old.original_starts_at, old.starts_at);
  end if;

  return new;
end;
$$;

create trigger appointments_record_move
  before update of starts_at on public.appointments
  for each row
  execute function app.record_appointment_move();

comment on function app.record_appointment_move() is
  'Anota que un turno cambió de horario. Va en un disparador y no en cada '
  'función que mueve turnos, para que ninguna se pueda olvidar.';
