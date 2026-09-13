-- ============================================================================
-- Dlay Estética · Perfiles que quedaron huérfanos
--
-- `profiles` se llena con un trigger que corre al crear el usuario, y sólo
-- entonces. Eso alcanza mientras nadie toque la base por abajo, pero hay un
-- caso donde no:
--
--   Las cuentas viven en el esquema `auth` y los perfiles en `public`. Si se
--   rehace `public` —un despliegue que quedó a medias, una base que se
--   reinicia de cero— las cuentas sobreviven y los perfiles no. El trigger no
--   los repone porque nadie se está registrando: esas personas ya existían.
--
-- Lo que se ve después es desconcertante, porque casi todo funciona: se puede
-- entrar, crear la estética y trabajar, ya que las membresías cuelgan de
-- `auth.users`. Lo que falla es todo lo que guarda quién hizo algo —el autor
-- de una nota, quién abrió la caja, a qué usuario pertenece una suscripción de
-- notificaciones— porque eso sí cuelga de `profiles`.
--
-- Pasó en producción el 13/09/2026: activar las notificaciones devolvía
-- «violates foreign key constraint push_subscriptions_user_id_fkey».
-- ============================================================================

insert into public.profiles (id, full_name)
select u.id,
       coalesce(
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name',
         split_part(u.email, '@', 1)
       )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

comment on table public.profiles is
  'Datos públicos de un usuario. auth.users no se consulta desde la app: '
  'todo lo que necesita saber de una persona sale de acá. Se llena con un '
  'trigger al crear la cuenta, y esta migración repone los que hayan quedado '
  'sin su fila.';
