-- ============================================================================
-- Dlay Agenda · El precio pasa a ser fijo: $10.000 por mes
--
-- Hasta acá una cuenta nueva pagaba el 3% de lo facturado. Desde ahora paga
-- un abono fijo de $10.000 por mes, más lo que Meta le cobre por cada mensaje
-- de WhatsApp, que sale contra su propia tarjeta y no pasa por Dlay.
--
-- CÓMO SE HACE SIN REESCRIBIR NADA. El 3% de fábrica no está en un solo
-- lugar: seis funciones lo repiten como `coalesce(bs.mode, 'percent')` y
-- `coalesce(bs.commission_bps, 300)` para el negocio que todavía no tiene
-- fila de cobro. Rehacer esas funciones desde versiones viejas es justo como
-- se pierden arreglos posteriores. En lugar de eso, todo negocio nuevo nace
-- con su fila, y esos valores de respaldo dejan de usarse.
--
-- LO QUE NO SE TOCA. Los negocios que ya existen siguen con lo que tienen
-- configurado en el panel: cambiarles el precio a mitad de mes desde una
-- migración sería decidir por Dlay un acuerdo comercial. Si alguno tiene que
-- pasar al abono nuevo, se cambia desde el panel, que es donde se acuerda.
--
-- Un mes sin turnos atendidos sigue sin cobrarse, también con abono fijo:
-- `app.billable_periods` sólo cuenta meses con turnos que ya ocurrieron.
-- ============================================================================

alter table public.billing_settings
  alter column mode set default 'fixed',
  alter column fixed_cents set default 1000000;

comment on column public.billing_settings.fixed_cents is
  'El abono mensual, en centavos. De fábrica: $10.000. Se cobra cada mes en '
  'que el negocio atendió al menos un turno.';

create or replace function app.cobro_de_fabrica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_settings (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

comment on function app.cobro_de_fabrica() is
  'Todo negocio nace con su fila de cobro, con el abono fijo de fábrica. Sin '
  'esto caería en los valores de respaldo de las funciones viejas, que todavía '
  'dicen 3%.';

create trigger tenants_cobro_de_fabrica
  after insert on public.tenants
  for each row execute function app.cobro_de_fabrica();
