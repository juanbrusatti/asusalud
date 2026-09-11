-- ============================================================================
-- Dlay Estética · Reloj
--
-- Acá está la decisión que hace que el producto entre en los planes gratuitos.
--
-- El plan Hobby de Vercel permite UN cron por día: cualquier expresión más
-- frecuente falla al desplegar. Un motor de recordatorios necesita revisar la
-- cola cada pocos minutos. Así que el reloj vive dentro de Postgres, que en el
-- plan gratuito de Supabase admite cadencia de un minuto.
--
-- Beneficio extra que no es menor: los recordatorios se siguen planificando
-- aunque un deploy de la web falle.
-- ============================================================================

create extension if not exists pg_cron;

-- Corre cada cinco minutos. No hace falta más seguido: el planificador mira
-- setenta y dos horas hacia adelante, así que un envío que vence dentro de
-- tres días ya está en la cola mucho antes.
--
-- Es idempotente, así que dos corridas solapadas no duplican nada.
select cron.schedule(
  'dlay-planificar-recordatorios',
  '*/5 * * * *',
  $$ select app.plan_reminders('72 hours'::interval) $$
);

comment on extension pg_cron is
  'El reloj del motor de recordatorios. Ver docs/modulos/recordatorios.md';

-- El despachador todavía no se programa: mientras no haya un emisor que
-- realmente entregue los mensajes, sacar filas de la cola sólo las marcaría
-- como enviadas sin que nadie reciba nada. Se agenda junto con el emisor.
