-- ============================================================================
-- Dlay Agenda · Escribir los ajustes de plataforma sin entrar a la base
--
-- `dispatch_url`, `dispatch_secret` y `site_url` viven en una tabla porque el
-- reloj de Postgres los lee desde adentro. Hasta ahora eso obligaba a pegar un
-- SQL a mano en el panel después de cada despliegue, que es justo el paso que
-- se olvida: sin `dispatch_url`, la cola se llena y no la vacía nadie, y no
-- hay ningún error en ningún lado que lo diga.
--
-- Con esto el script de despliegue los escribe solo.
--
-- No agrega ningún permiso nuevo: `service_role` ya puede hacer cualquier cosa
-- en la base. Lo que agrega es una puerta angosta —sólo estas tres claves— en
-- lugar de tener que abrir una consola.
-- ============================================================================

create or replace function public.rpc_set_platform_setting(
  p_key   text,
  p_value text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lista blanca. Si mañana hay una clave nueva, se agrega acá a propósito y
  -- no por accidente.
  if p_key not in ('dispatch_url', 'dispatch_secret', 'site_url') then
    return jsonb_build_object('ok', false,
      'error', format('«%s» no es un ajuste que se pueda escribir así.', p_key));
  end if;

  if coalesce(trim(p_value), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'El valor viene vacío.');
  end if;

  insert into public.platform_settings (key, value)
  values (p_key, trim(p_value))
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('ok', true, 'key', p_key);
end;
$$;

revoke all on function public.rpc_set_platform_setting(text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_set_platform_setting(text, text)
  to service_role;
