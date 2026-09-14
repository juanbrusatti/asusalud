-- ============================================================================
-- Dlay Agenda · Conectar WhatsApp desde el panel
--
-- Hasta ahora las credenciales de WhatsApp se cargaban a mano en la base. Eso
-- no escala: si el sistema lo usan cien negocios, alguien de Dlay tendría que
-- estar detrás de cada uno.
--
-- Meta resuelve esto con el Embedded Signup: el dueño hace clic en un botón,
-- se abre una ventana de Facebook, elige su número y listo. Para ofrecerlo,
-- Dlay tiene que estar aprobada como Tech Provider, que es un trámite aparte.
--
-- Esta migración prepara las dos puertas:
--
--   · `manual`, la de hoy: alguien pega las credenciales que sacó de la consola
--     de Meta. Sirve para el primer negocio y para grabar los videos que el
--     propio App Review de Meta exige.
--   · `embedded`, la que viene: el token lo trae el intercambio con Meta y el
--     `app_secret` deja de ser de cada negocio, porque el webhook pasa a ser
--     uno solo, el de la app de Dlay.
--
-- El token nunca vuelve al navegador, ni siquiera para quien es titular. Se
-- escribe y no se lee: lo lee el emisor, que corre con permisos del sistema.
-- ============================================================================

alter table public.whatsapp_accounts
  add column onboarding text not null default 'manual'
    check (onboarding in ('manual', 'embedded'));

comment on column public.whatsapp_accounts.onboarding is
  'Cómo se conectó la cuenta. En `embedded` el app_secret es el de la app de '
  'Dlay y no el del negocio: hay un solo webhook para todos.';

-- La vista suma lo que no es secreto y hace falta en pantalla.
drop view if exists public.whatsapp_status;

create view public.whatsapp_status
with (security_invoker = false)
as
  select
    wa.tenant_id,
    wa.waba_id,
    wa.display_phone,
    wa.status,
    wa.quality_rating,
    wa.messaging_limit,
    wa.onboarding,
    wa.last_checked_at,
    wa.access_token is not null as has_token
  from public.whatsapp_accounts wa
  where (select app.has_tenant(wa.tenant_id));

comment on view public.whatsapp_status is
  'Lo que el panel puede ver de la cuenta de WhatsApp: estado y calidad, nunca '
  'las credenciales. Corre con permisos de su dueño y filtra por negocio.';

revoke all on public.whatsapp_status from anon, authenticated;
grant select on public.whatsapp_status to authenticated;

-- ---------------------------------------------------------------------------
-- Conectar
-- ---------------------------------------------------------------------------
-- La tabla no tiene ningún GRANT para `authenticated`, así que guardar pasa
-- por acá. La función comprueba el rol ella misma: es `security definer` y no
-- la protege ninguna política.
create or replace function public.whatsapp_connect(
  p_phone_number_id text,
  p_access_token    text,
  p_waba_id         text default null,
  p_display_phone   text default null,
  p_app_secret      text default null,
  p_verify_token    text default null,
  p_onboarding      text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select m.tenant_id into v_tenant
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role in ('owner', 'admin')
  limit 1;

  if v_tenant is null then
    return jsonb_build_object('ok', false,
      'error', 'Sólo quien es titular o administra el negocio puede conectar WhatsApp.');
  end if;

  if coalesce(trim(p_phone_number_id), '') = ''
     or coalesce(trim(p_access_token), '') = '' then
    return jsonb_build_object('ok', false,
      'error', 'Faltan el identificador del número y el token.');
  end if;

  insert into public.whatsapp_accounts (
    tenant_id, phone_number_id, access_token, waba_id, display_phone,
    app_secret, verify_token, onboarding, status
  )
  values (
    v_tenant, trim(p_phone_number_id), trim(p_access_token),
    nullif(trim(coalesce(p_waba_id, '')), ''),
    nullif(trim(coalesce(p_display_phone, '')), ''),
    nullif(trim(coalesce(p_app_secret, '')), ''),
    nullif(trim(coalesce(p_verify_token, '')), ''),
    coalesce(p_onboarding, 'manual'),
    -- Conectada es lo que diga Meta, no lo que diga quien cargó los datos.
    'pending'
  )
  on conflict (tenant_id) do update
    set phone_number_id = excluded.phone_number_id,
        access_token    = excluded.access_token,
        waba_id         = coalesce(excluded.waba_id, public.whatsapp_accounts.waba_id),
        display_phone   = coalesce(excluded.display_phone, public.whatsapp_accounts.display_phone),
        app_secret      = coalesce(excluded.app_secret, public.whatsapp_accounts.app_secret),
        verify_token    = coalesce(excluded.verify_token, public.whatsapp_accounts.verify_token),
        onboarding      = excluded.onboarding,
        status          = 'pending',
        updated_at      = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Desconectar
-- ---------------------------------------------------------------------------
-- Se borra la fila entera en lugar de vaciar el token: una cuenta a medias,
-- con estado «conectada» y sin credenciales, es peor que ninguna.
create or replace function public.whatsapp_disconnect()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select m.tenant_id into v_tenant
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role in ('owner', 'admin')
  limit 1;

  if v_tenant is null then
    return jsonb_build_object('ok', false,
      'error', 'Sólo quien es titular o administra el negocio puede desconectar WhatsApp.');
  end if;

  delete from public.whatsapp_accounts where tenant_id = v_tenant;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.whatsapp_connect(text, text, text, text, text, text, text)
  from public, anon;
revoke all on function public.whatsapp_disconnect() from public, anon;

grant execute on function public.whatsapp_connect(text, text, text, text, text, text, text)
  to authenticated;
grant execute on function public.whatsapp_disconnect() to authenticated;
