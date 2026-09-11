# Variables de entorno

Se validan con Zod en `src/lib/env.ts` al arrancar. Un deploy mal configurado
falla en el build con un mensaje que dice exactamente qué falta, en vez de
romperse semanas después en medio de un envío.

| Variable | Dónde se usa | Obligatoria | Qué es |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | navegador y servidor | sí | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador y servidor | sí | Clave pública. Todo lo que hace pasa por RLS |
| `NEXT_PUBLIC_SITE_URL` | servidor | no | URL pública del sitio. Por defecto `http://localhost:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | **sólo servidor** | no | Clave con permisos totales |
| `SUPABASE_DB_URL` | pruebas | no | Conexión directa a Postgres para la suite de aislamiento |

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

## En Vercel

Las tres primeras van como variables de entorno del proyecto. La clave de
servicio, sólo cuando haya trabajos del sistema que la necesiten (fase 2), y
marcada para todos los entornos excepto Preview si los previews son públicos.
