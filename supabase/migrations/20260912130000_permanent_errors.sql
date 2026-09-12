-- ============================================================================
-- Dlay Estética · Errores que no se arreglan reintentando
--
-- No todos los errores son iguales. Que Meta devuelva un 503 es transitorio y
-- vale la pena volver a intentarlo. Que la ficha no tenga teléfono, o que la
-- estética todavía no haya conectado su cuenta, no se arregla insistiendo:
-- reintentar tres veces sólo ensucia la bitácora y demora el resto de la cola.
--
-- Los permanentes se marcan de una y con el motivo en castellano, porque son
-- exactamente los que alguien tiene que ir a resolver a mano.
-- ============================================================================

create or replace function app.finish_job(
  p_id          uuid,
  p_ok          boolean,
  p_subject     text default null,
  p_body        text default null,
  p_provider_id text default null,
  p_error       text default null,
  p_was_test    boolean default false,
  p_permanent   boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  select attempts into v_attempts from public.message_jobs where id = p_id;

  if p_ok then
    update public.message_jobs
    set status = 'sent',
        sent_at = now(),
        rendered_subject = p_subject,
        rendered_body = p_body,
        provider_message_id = p_provider_id,
        was_test = p_was_test,
        last_error = null
    where id = p_id;

  elsif p_permanent then
    -- Falta un dato o una configuración: insistir no cambia nada.
    update public.message_jobs
    set status = 'failed', last_error = p_error, was_test = p_was_test
    where id = p_id;

  elsif coalesce(v_attempts, 0) >= 3 then
    -- Tres intentos alcanzan. Insistir más sobre algo que no se arregla solo
    -- es justo lo que degrada la reputación de la cuenta.
    update public.message_jobs
    set status = 'failed', last_error = p_error
    where id = p_id;

  else
    -- Transitorio: vuelve a la cola con una espera creciente.
    update public.message_jobs
    set status = 'pending',
        last_error = p_error,
        scheduled_for = now() + make_interval(mins => power(4, coalesce(v_attempts, 1))::integer)
    where id = p_id;
  end if;
end;
$$;

create or replace function public.rpc_finish_job(
  p_id          uuid,
  p_ok          boolean,
  p_subject     text default null,
  p_body        text default null,
  p_provider_id text default null,
  p_error       text default null,
  p_was_test    boolean default false,
  p_permanent   boolean default false
)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.finish_job(
    p_id, p_ok, p_subject, p_body, p_provider_id, p_error, p_was_test, p_permanent
  );
$$;

revoke all on function public.rpc_finish_job(uuid, boolean, text, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.rpc_finish_job(uuid, boolean, text, text, text, text, boolean, boolean)
  to service_role;

-- La versión vieja de siete argumentos ya no se usa.
drop function if exists public.rpc_finish_job(uuid, boolean, text, text, text, text, boolean);
drop function if exists app.finish_job(uuid, boolean, text, text, text, text, boolean);
