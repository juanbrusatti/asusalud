-- ============================================================================
-- Dlay Agenda · Crear las plantillas en Meta desde acá
--
-- De los cinco pasos del alta, el que se rompe siempre es el de las
-- plantillas. Hay que escribir a mano el nombre exacto —`recordatorio_dia_
-- anterior`, con guiones bajos y sin tildes—, el cuerpo con {{1}} a {{6}} en
-- el orden correcto, y tres botones también en orden.
--
-- Un guión de más y Meta aprueba una plantilla que el emisor nunca va a
-- encontrar. El error no aparece en el trámite: aparece meses después, cuando
-- un recordatorio no sale y nadie se entera de que no salió.
--
-- Meta tiene API para crear plantillas. Esto devuelve lo que hace falta para
-- armar el pedido, así el paso 5 es un botón y no un formulario donde hay que
-- no equivocarse seis veces seguidas.
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
               'nombre',        t.name,
               'en_meta',       t.provider_name,
               'idioma',        coalesce(t.provider_language, 'es_AR'),
               'cuerpo',        t.body,
               'categoria',     upper(t.category::text),
               'quick_replies', coalesce(t.quick_replies, '{}')
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

-- ---------------------------------------------------------------------------
-- Anotar cómo quedó cada una
-- ---------------------------------------------------------------------------
create or replace function public.rpc_mark_template_status(
  p_tenant uuid,
  p_provider_name text,
  p_status text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.message_templates
  set provider_status = case
        when lower(p_status) in ('approved','pending','rejected','paused')
          then lower(p_status)
        else 'pending'
      end
  where tenant_id = p_tenant
    and channel = 'whatsapp'
    and provider_name = p_provider_name;
$$;

revoke all on function public.rpc_mark_template_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rpc_mark_template_status(uuid, text, text) to service_role;

comment on function public.rpc_mark_template_status(uuid, text, text) is
  'Guarda en qué estado quedó la plantilla del lado de Meta, para que la '
  'pantalla no diga «sin aprobar» cuando ya está aprobada.';
