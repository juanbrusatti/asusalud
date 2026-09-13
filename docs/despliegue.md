# Despliegue

## Los tres entornos

| Dónde | Base de datos | Para qué |
| --- | --- | --- |
| Tu máquina | Supabase local (Docker) | Desarrollo diario y la suite de pruebas |
| Vercel · Preview | Proyecto de desarrollo | Cada rama y cada pull request |
| Vercel · Production | Proyecto de la estética | Lo que usa Asusalud |

La regla que no se rompe: **una rama nueva nunca corre contra la base de la
estética**. Por eso Preview y Production apuntan a proyectos distintos.

El desarrollo local sigue contra Docker: es más rápido, no gasta cuota y la
suite de aislamiento habla directo con Postgres.

## 1. Las migraciones, en la base

```bash
scripts/deploy-db.sh prod
```

Saca la referencia del proyecto de la URL que hay en `.env.production.local`,
enlaza y aplica las migraciones en orden. Va a pedir la **contraseña de la
base**, que es la que se eligió al crear el proyecto; si no la tenés, se cambia
en *Settings → Database → Reset database password*.

Lo mismo para el otro proyecto:

```bash
scripts/deploy-db.sh preview
```

> Conviene hacer primero el de desarrollo. Si algo falla, falla donde no
> importa.

Después de aplicarlas, verificá en el panel de Supabase que estén las
extensiones `pg_cron` y `pg_net` (*Database → Extensions*). El planificador de
recordatorios y el emisor no funcionan sin ellas.

## 2. Las variables, en Vercel

```bash
npx vercel login
npx vercel link
scripts/vercel-env.sh prod
scripts/vercel-env.sh preview
```

Los valores salen de `.env.production.local` y `.env.preview.local`, que **git
ignora**. El script no los imprime.

| Variable | Production | Preview |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | proyecto de la estética | proyecto de desarrollo |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ídem | ídem |
| `NEXT_PUBLIC_SITE_URL` | el dominio real | se puede omitir |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | la misma en los dos | ídem |
| `SUPABASE_SERVICE_ROLE_KEY` | **nunca con `NEXT_PUBLIC_`** | ídem |

`NEXT_PUBLIC_SITE_URL` importa más de lo que parece: de ahí sale el enlace del
turno que viaja en los recordatorios. Si queda con el dominio provisorio, los
enlaces que ya se enviaron siguen apuntando ahí.

> Las variables se aplican al **próximo** deploy. El que ya falló no se rehace
> solo: hay que volver a desplegar.

## 3. Los ajustes que viven en la base

Hay tres valores que no son variables de entorno porque el reloj de Postgres
los lee desde adentro. Se cargan una vez por proyecto, desde el SQL editor:

```sql
insert into public.platform_settings (key, value) values
  ('site_url',        'https://el-dominio-real'),
  ('dispatch_url',    'https://<ref>.supabase.co/functions/v1/dispatch'),
  ('dispatch_secret', '<algo largo y al azar>')
on conflict (key) do update set value = excluded.value;
```

Sin `dispatch_url`, `app.trigger_dispatch()` sale sin hacer nada: la cola se
llena y no la vacía nadie.

## 4. Las Edge Functions

Corren en Supabase, no en Vercel, así que tienen sus propios secretos.

```bash
npx supabase secrets set \
  DISPATCH_SECRET='<el mismo de arriba>' \
  VAPID_PUBLIC_KEY='<la pública>' \
  VAPID_PRIVATE_KEY='<la privada>' \
  BREVO_API_KEY='<la de Brevo>'

npx supabase functions deploy dispatch
npx supabase functions deploy whatsapp-webhook
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola.

## 5. Después del primer deploy

- Entrar y **crear la estética**. El alta de cuenta crea la primera dueña.
- Cargar **horarios de atención** en Ajustes: sin ellos la reserva online no
  ofrece ningún horario.
- Dejar el **modo de prueba encendido** en Ajustes → Envío de mensajes hasta
  que WhatsApp esté conectado. Es como nace y es deliberado.
- Revisar que la agenda, la caja y los informes se vean con datos reales.

## Dos cosas que hay que saber antes de facturar

**El plan Hobby de Vercel es para uso personal y no comercial.** Sirve para
probar; el día que la estética paga por el sistema, hay que pasar a Pro. No es
una recomendación: es lo que dicen los términos.

**Un proyecto gratuito de Supabase se pausa tras una semana sin actividad.**
Para una agenda que se usa todos los días no debería pasar, pero una estética
que cierra por vacaciones vuelve y encuentra la base dormida. Es otro motivo
para pasar a un plan pago antes de que esto sea el sistema del que dependen.

## Lo que todavía no está

- **Backups propios.** Supabase hace los suyos, pero una exportación periódica
  a otro lado es lo que salva de un borrado accidental.
- **Un dominio propio** en lugar del `.vercel.app`.
- **Separar los secretos de la Edge Function** en Vault, que sigue pendiente.
