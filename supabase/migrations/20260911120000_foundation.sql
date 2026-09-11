-- ============================================================================
-- Dlay Estética · Fundación
-- Extensiones, esquema privado `app`, enums y utilidades compartidas.
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- Esquema privado. No se expone por PostgREST: sólo lo usan las políticas RLS
-- y los triggers. Todo lo que viva acá es infraestructura, nunca datos.
create schema if not exists app;

comment on schema app is
  'Helpers internos de seguridad y auditoría. No expuesto por la API.';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Roles dentro de una estética. El rol vive en la membresía, no en el usuario:
-- una misma persona puede ser dueña de una estética y recepción en otra.
create type public.app_role as enum ('owner', 'admin', 'staff', 'reception');

comment on type public.app_role is
  'owner: control total incluida la facturación. admin: gestión completa sin '
  'facturación. staff: su propia agenda y sus clientes. reception: agenda y '
  'clientes de todos, sin caja ni configuración.';

create type public.membership_status as enum ('active', 'invited', 'suspended');

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

-- Mantiene updated_at sin que ninguna capa de aplicación tenga que acordarse.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.touch_updated_at() is
  'Trigger BEFORE UPDATE: refresca updated_at.';
