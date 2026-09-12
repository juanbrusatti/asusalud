-- ============================================================================
-- Dlay Estética · Agenda del emisor
--
-- El planificador ya llenaba la cola; esto la vacía. Corre cada minuto porque
-- un recordatorio que sale cinco minutos tarde ya no sirve para el turno de
-- las nueve.
--
-- La URL y el secreto se guardan como configuración de la base y no en el
-- texto del cron: así cambiar de entorno no obliga a reescribir migraciones.
-- ============================================================================

create table if not exists public.platform_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
alter table public.platform_settings force row level security;
revoke all on public.platform_settings from anon, authenticated;

comment on table public.platform_settings is
  'Configuración de la plataforma, no de ninguna estética. Sin acceso para '
  'usuarios: la leen el reloj y las funciones del sistema.';

-- Llama al emisor. Si todavía no está configurado, no hace nada en lugar de
-- llenar el log de errores cada minuto.
create or replace function app.trigger_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from public.platform_settings where key = 'dispatch_url';
  select value into v_secret from public.platform_settings where key = 'dispatch_secret';

  if v_url is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-dlay-secret', coalesce(v_secret, '')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'dlay-despachar-recordatorios',
  '* * * * *',
  $$ select app.trigger_dispatch() $$
);
