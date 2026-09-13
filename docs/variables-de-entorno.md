# Variables de entorno

Se validan con Zod en `src/lib/env.ts` al arrancar. Un deploy mal configurado
falla en el build con un mensaje que dice exactamente qué falta, en vez de
romperse semanas después en medio de un envío.

| Variable | Dónde se usa | Obligatoria | Qué es |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | navegador y servidor | sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | navegador y servidor | sí | Clave pública. Todo lo que hace pasa por RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador y servidor | — | El nombre viejo de la misma clave. Se usa si no está la de arriba |
| `NEXT_PUBLIC_SITE_URL` | servidor | no | URL pública del sitio. Por defecto `http://localhost:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | **sólo servidor** | no | Clave con permisos totales |
| `SUPABASE_DB_URL` | pruebas | no | Conexión directa a Postgres para la suite de aislamiento |

## Dos nombres para la clave pública

Supabase la renombró: los proyectos nuevos muestran `sb_publishable_…` y ya no
un JWT llamado «anon». Las dos funcionan y la biblioteca las trata igual, así
que el código acepta los dos nombres y prefiere el nuevo.

Sin eso, quien copia lo que ve en el panel de un proyecto nuevo pega la clave
correcta con el nombre que el código no busca, y el build falla diciendo que
falta.

## Sobre la clave de servicio

`SUPABASE_SERVICE_ROLE_KEY` **se saltea toda la RLS**. Quien la tiene puede
leer y escribir los datos de todas las estéticas.

- Nunca con prefijo `NEXT_PUBLIC_`.
- Nunca importada desde un componente de cliente. `src/lib/supabase/admin.ts`
  lleva `import "server-only"`, así que el build falla si alguien lo intenta.
- Sólo para tareas del sistema: colas de envío, webhooks firmados,
  importaciones y trabajos programados.
- Nunca para destrabar un problema de permisos. Si una consulta no devuelve lo
  que debería, la política está mal y se arregla la política.

## En local

`npm run db:start` imprime las claves del proyecto local. Son siempre las
mismas y no son secretas: valen únicamente contra el Postgres de tu máquina.

## En las Edge Functions

El emisor corre en Supabase, no en Vercel, así que tiene sus propias variables.
Se cargan con `supabase secrets set`.

| Variable | Obligatoria | Qué es |
| --- | --- | --- |
| `BREVO_API_KEY` | para enviar correos | Clave de la cuenta de Brevo |
| `MAIL_FROM` | no | Remitente verificado. Por defecto `turnos@dlay.app` |
| `DISPATCH_SECRET` | sí en producción | Sin esto, cualquiera puede forzar el vaciado de la cola |
| `DISPATCH_BATCH` | no | Envíos por corrida. Por defecto 20 |
| `DISPATCH_MIN_MS` / `DISPATCH_MAX_MS` | no | Pausa entre envíos. Por defecto 1500 y 4000 |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola.

Además, en la tabla `platform_settings` de la base van `dispatch_url` y
`dispatch_secret`, que es lo que usa el reloj para llamar al emisor.

## Desplegar

El paso a paso completo —migraciones, variables, ajustes de la base y Edge
Functions— está en [Despliegue](despliegue.md).

## En Vercel

Las tres primeras van como variables de entorno del proyecto. La clave de
servicio, sólo cuando haya trabajos del sistema que la necesiten (fase 2), y
marcada para todos los entornos excepto Preview si los previews son públicos.
