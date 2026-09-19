-- ============================================================================
-- Dlay Agenda · Cuántos mensajes quedaron sin ver
--
-- La bandeja ya sabe cuáles esperan respuesta, que no es lo mismo que «sin
-- ver»: alguien puede leer un mensaje, decidir que no hace falta contestarlo y
-- dejarlo ahí. Para un contador en la barra hace falta lo segundo.
--
-- Se guarda POR PERSONA y no por negocio. Si Jesica abre la conversación, el
-- número tiene que bajarle a ella y no a quien esté atendiendo en el otro
-- turno: un contador compartido se apaga solo y el mensaje se pierde.
--
-- Los botones no cuentan. Confirmar o cancelar ya lo resolvió el sistema y le
-- contestó a la clienta: sumarlos al número haría que la barra pida atención
-- por algo que no la necesita, y un contador que siempre tiene números se
-- vuelve parte del fondo.
-- ============================================================================

create table public.whatsapp_reads (
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  telefono     text not null,
  last_read_at timestamptz not null default now(),

  primary key (user_id, tenant_id, telefono)
);

comment on table public.whatsapp_reads is
  'Hasta dónde leyó cada persona en cada conversación. Es lo único que hace '
  'honesto al contador de la barra.';

alter table public.whatsapp_reads enable row level security;
alter table public.whatsapp_reads force row level security;

-- Cada quien toca su propia marca y nada más. El `has_tenant` de arriba no
-- alcanza: sin la condición del usuario, alguien del equipo podría apagarle
-- el contador a otro.
create policy "whatsapp_reads: la propia"
  on public.whatsapp_reads for all to authenticated
  using ( user_id = (select auth.uid()) and (select app.has_tenant(tenant_id)) )
  with check ( user_id = (select auth.uid()) and (select app.has_tenant(tenant_id)) );

revoke all on public.whatsapp_reads from anon, authenticated;
grant select, insert, update on public.whatsapp_reads to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar una conversación como leída
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_marcar_visto(
  p_tenant uuid, p_telefono text
)
returns void
language sql
set search_path = ''
as $$
  insert into public.whatsapp_reads (tenant_id, user_id, telefono, last_read_at)
  values (p_tenant, (select auth.uid()), app.solo_digitos(p_telefono), now())
  on conflict (user_id, tenant_id, telefono)
  do update set last_read_at = now();
$$;

revoke all on function public.whatsapp_marcar_visto(uuid, text)
  from public, anon;
grant execute on function public.whatsapp_marcar_visto(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- El número de la barra
-- ---------------------------------------------------------------------------
create or replace function public.whatsapp_sin_ver(p_tenant uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.whatsapp_inbound i
  left join public.whatsapp_reads r
    on r.tenant_id = i.tenant_id
   and r.user_id = (select auth.uid())
   and r.telefono = app.solo_digitos(i.from_phone)
  where i.tenant_id = p_tenant
    -- Lo que escribieron, no lo que apretaron.
    and i.payload is null
    and (r.last_read_at is null or i.received_at > r.last_read_at);
$$;

comment on function public.whatsapp_sin_ver(uuid) is
  'Mensajes escritos que esta persona todavía no abrió. Corre con sus '
  'permisos, así que la RLS de whatsapp_inbound ya la limita a sus estéticas.';

revoke all on function public.whatsapp_sin_ver(uuid) from public, anon;
grant execute on function public.whatsapp_sin_ver(uuid) to authenticated;
