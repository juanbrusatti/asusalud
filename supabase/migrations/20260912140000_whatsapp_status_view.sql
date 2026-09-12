-- ============================================================================
-- Dlay Estética · Vista de estado de WhatsApp
--
-- `whatsapp_accounts` no tiene ningún permiso para `authenticated`: el token no
-- se expone ni a la dueña de la estética. Pero el panel sí tiene que poder
-- mostrar si la cuenta está conectada y cómo viene su calidad.
--
-- Para eso existe esta vista, y corre con los permisos de SU DUEÑO y no con los
-- de quien la consulta. Es el patrón de "vista de proyección segura": la vista
-- alcanza la tabla cerrada, pero sólo devuelve las columnas inofensivas y
-- filtra por estética con app.has_tenant(), que sigue mirando quién preguntó.
--
-- Con security_invoker la vista heredaría la falta de permisos de quien
-- consulta y no devolvería nada; sin el filtro de adentro, devolvería las
-- cuentas de todas las estéticas. Hacen falta las dos cosas juntas.
-- ============================================================================

drop view if exists public.whatsapp_status;

create view public.whatsapp_status
with (security_invoker = false)
as
  select
    wa.tenant_id,
    wa.display_phone,
    wa.status,
    wa.quality_rating,
    wa.messaging_limit,
    wa.last_checked_at,
    wa.access_token is not null as has_token
  from public.whatsapp_accounts wa
  where (select app.has_tenant(wa.tenant_id));

comment on view public.whatsapp_status is
  'Lo que el panel puede ver de la cuenta de WhatsApp: estado y calidad, nunca '
  'las credenciales. Corre con permisos de su dueño y filtra por estética.';

revoke all on public.whatsapp_status from anon, authenticated;
grant select on public.whatsapp_status to authenticated;
