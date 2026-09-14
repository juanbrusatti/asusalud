# Arquitectura

## La decisión que ordena todo lo demás

El plan gratuito de Vercel permite **un cron por día como máximo**: cualquier
expresión que dispare más seguido falla al desplegar. Un motor de recordatorios
necesita revisar la cola cada pocos minutos.

Por eso **el reloj vive dentro de Postgres**, no en Vercel. Supabase trae
`pg_cron` y `pg_net` habilitados en el plan gratuito, con cadencia de hasta un
minuto.

```
Vercel (Next.js)            Supabase
┌──────────────────┐        ┌────────────────────────────────────┐
│ Interfaz         │        │ Postgres + RLS                     │
│ Server Actions   │ ─────► │ Auth · Storage                     │
│ Reserva pública  │        │ pg_cron  → planificador (5 min)    │
└──────────────────┘        │ pg_cron  → despachador (1 min)     │
                            │ Edge Fn  → emisor y webhooks       │
                            └────────────────────────────────────┘
```

Dos consecuencias buenas: el producto entra entero en los planes gratuitos, y
los recordatorios siguen saliendo aunque un deploy de la web falle.

> Los términos de Vercel reservan el plan Hobby para uso **personal y no
> comercial**. En cuanto el negocio pague, corresponde pasar a Pro. La
> arquitectura no depende de Pro: es una decisión comercial, no técnica.

## Capas

| Capa | Dónde vive | Responsabilidad |
| --- | --- | --- |
| Interfaz | `src/app`, `src/components` | Pantallas y formularios. Server Components por defecto |
| Acciones | `src/lib/actions` | Escrituras desde la UI. Validan con Zod antes de tocar la base |
| Acceso a datos | `src/lib/supabase` | Tres clientes con tres alcances distintos |
| Sesión y tenant | `src/lib/auth`, `src/proxy.ts` | Refresco de sesión y negocio activo |
| Datos y reglas | `supabase/migrations` | Esquema, RLS, triggers y funciones |

## Los tres clientes de Supabase

Cuál se usa no es una preferencia: define quién puede ver qué.

| Archivo | Corre en | Actúa como | Cuándo |
| --- | --- | --- | --- |
| `supabase/client.ts` | navegador | la persona | Componentes interactivos |
| `supabase/server.ts` | servidor | la persona | Server Components y Actions |
| `supabase/admin.ts` | servidor | **el sistema** | Sólo colas, webhooks e importaciones |

Los dos primeros pasan por RLS. El tercero **se la saltea entera**, y por eso
lleva `import "server-only"`.

## El proxy

`src/proxy.ts` refresca la sesión en cada navegación y manda a `/entrar` a
quien no tenga una.

Es comodidad de navegación, **no seguridad**. Quien decide qué datos salen es
la RLS: aunque alguien evite el proxy, la base no le devuelve nada ajeno. Usa
`getUser()` y no `getSession()`, porque el segundo se limita a leer una cookie
que el navegador puede haber manipulado.

## PWA

- `src/app/manifest.ts` genera el manifiesto. `display: standalone` es lo que
  hace que se sienta una aplicación y no una pestaña.
- `public/sw.js` es el service worker. Deliberadamente conservador: cachea los
  estáticos del build y nada más. **Nunca guarda respuestas de la API.** Una
  agenda vieja mostrada como si fuera la de hoy es peor que una pantalla sin
  conexión.
- `src/components/pwa/register-sw.tsx` lo registra después del `load` y sólo en
  producción.
- Los iconos se generan con `node scripts/make-icons.mjs`.

## Lo que todavía no está

El scheduler, las Edge Functions y los canales de envío llegan en la fase 2.
La arquitectura ya los contempla; el código, no. No hay `pg_cron` habilitado
todavía a propósito: se activa cuando haya algo que despachar.
