-- ============================================================================
-- Dlay Agenda · Poder cambiarle el nombre a una plantilla
--
-- Meta reserva el nombre de una plantilla borrada durante 30 DÍAS. Borrar para
-- recrear, que era lo que hacíamos, quema el nombre por un mes.
--
-- De ahora en más se edita en lugar de borrar, que además conserva el
-- historial de la plantilla. Pero cuando un nombre ya quedó quemado —o cuando
-- Meta rechaza uno por cualquier motivo— hace falta poder crear con otro
-- nombre y que el emisor se entere, porque el emisor pide la plantilla por
-- nombre exacto.
-- ============================================================================

create or replace function public.rpc_set_template_provider_name(
  p_tenant        uuid,
  p_provider_name text,
  p_nuevo_nombre  text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.message_templates
  set provider_name = p_nuevo_nombre,
      provider_status = 'pending'
  where tenant_id = p_tenant
    and channel = 'whatsapp'
    and provider_name = p_provider_name;
$$;

revoke all on function public.rpc_set_template_provider_name(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_set_template_provider_name(uuid, text, text)
  to service_role;

comment on function public.rpc_set_template_provider_name(uuid, text, text) is
  'Cambia el nombre con el que el emisor le pide la plantilla a Meta. Hace '
  'falta cuando un nombre quedó reservado por un borrado: Meta lo retiene 30 '
  'días.';
