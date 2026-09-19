-- ============================================================================
-- Dlay Agenda · Que la agenda se entere sola
--
-- Cuando una clienta toca «Confirmar» en WhatsApp, el turno cambia de estado
-- en la base y en la pantalla no pasa nada hasta que alguien recarga. El
-- trabajo ya está hecho; lo que falta es que se note.
--
-- Se publica `appointment_status_history` y no `appointments`, por tres
-- motivos que se acumulan:
--
--   · Cada fila ES un cambio de estado. Escuchando la tabla de turnos habría
--     que comparar el antes y el después, y para tener el «antes» hay que
--     poner la tabla en REPLICA IDENTITY FULL, que engorda cada escritura del
--     registro de transacciones.
--   · La fila ya trae `by_client`. Sin eso no se distingue una confirmación
--     que llegó sola de una que acaba de hacer la dueña con el mouse, y
--     sonaría en la cara de quien tocó el botón.
--   · `authenticated` sólo tiene SELECT sobre esta tabla, con su política de
--     RLS por estética. Realtime respeta esa política, así que el aislamiento
--     entre negocios no hay que escribirlo de nuevo: ya está.
--
-- Escuchar altas no necesita REPLICA IDENTITY: la fila nueva viaja entera.
-- ============================================================================

alter publication supabase_realtime add table public.appointment_status_history;

comment on table public.appointment_status_history is
  'Cada cambio de estado de un turno, con quién lo hizo. Va publicada en '
  'Realtime: es de acá que la agenda se entera, sin recargar, de que una '
  'clienta confirmó o canceló desde WhatsApp.';
