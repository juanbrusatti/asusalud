-- ============================================================================
-- Dlay Agenda · Que el alta del webhook se pueda hacer sola
--
-- Sin webhook, los mensajes salen pero las respuestas no vuelven: los tres
-- botones del recordatorio —confirmar, cancelar, cambiar horario— no hacen
-- nada. El cliente aprieta y del lado del negocio no pasa nada.
--
-- Hasta ahora la pantalla lo escondía detrás de un «opcional» y le pedía a la
-- persona que INVENTARA una palabra de verificación, sin mostrarle siquiera la
-- dirección que hay que pegar en Meta. Quien no es técnico se traba ahí, y es
-- el último tramo del alta.
--
-- Para poder mostrar lo que ya está cargado hace falta que la vista lo
-- devuelva. La palabra de verificación no es una credencial: sólo sirve para
-- que Meta y nosotros nos reconozcamos en el saludo inicial, y quien la ve es
-- quien tiene que pegarla del otro lado. El secreto de firma, en cambio, no
-- sale nunca: sólo se informa si está cargado.
-- ============================================================================

create or replace view public.whatsapp_status
with (security_invoker = false) as
  select
    wa.tenant_id,
    wa.waba_id,
    wa.display_phone,
    wa.status,
    wa.quality_rating,
    wa.messaging_limit,
    wa.onboarding,
    wa.last_checked_at,
    wa.access_token is not null as has_token,
    wa.verify_token,
    wa.app_secret is not null as has_app_secret
  from public.whatsapp_accounts wa
  where (select app.has_tenant(wa.tenant_id));

comment on view public.whatsapp_status is
  'Lo que la pantalla puede ver de la conexión. El token y el secreto de firma '
  'no salen nunca; sí la palabra de verificación, que quien conecta tiene que '
  'poder copiar para pegarla en Meta.';
