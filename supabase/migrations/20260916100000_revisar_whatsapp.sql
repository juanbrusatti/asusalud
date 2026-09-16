-- ============================================================================
-- Dlay Agenda · Revisar la conexión de WhatsApp antes de confiarle un cliente
--
-- Los cinco pasos de Meta terminan sin que nadie te diga si quedaron bien. El
-- token puede estar vencido, la plantilla puede haberse aprobado con otro
-- nombre, el número puede no estar registrado — y todo eso se descubre recién
-- cuando el primer recordatorio no llega y nadie se entera de que no llegó.
--
-- Esto devuelve lo que el emisor necesita para ir a preguntarle a Meta. Corre
-- desde donde salen los mensajes de verdad, así que prueba el mismo camino y
-- no una imitación.
-- ============================================================================

create or replace function public.rpc_whatsapp_credentials(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'phone_number_id', wa.phone_number_id,
    'waba_id',         wa.waba_id,
    'access_token',    wa.access_token,
    'display_phone',   wa.display_phone,
    -- Las plantillas que este negocio espera tener aprobadas en Meta, con el
    -- nombre exacto con el que el emisor las va a pedir. Si no coincide, Meta
    -- responde «template does not exist» y el mensaje no sale nunca.
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre',   t.name,
               'en_meta',  t.provider_name,
               'idioma',   coalesce(t.provider_language, 'es_AR')
             ) order by t.name)
      from public.message_templates t
      where t.tenant_id = p_tenant
        and t.channel = 'whatsapp'
        and t.is_active
        and t.provider_name is not null
    ), '[]'::jsonb)
  )
  from public.whatsapp_accounts wa
  where wa.tenant_id = p_tenant;
$$;

revoke all on function public.rpc_whatsapp_credentials(uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_whatsapp_credentials(uuid) to service_role;

comment on function public.rpc_whatsapp_credentials(uuid) is
  'Lo que hace falta para preguntarle a Meta si la conexión quedó bien. Sólo '
  'service_role: el token no vuelve nunca a la aplicación.';
