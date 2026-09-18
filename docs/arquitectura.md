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

## Por qué la navegación se siente inmediata

Dos cosas, y ninguna hace que el servidor conteste más rápido: hacen que la
espera no se note y que haya menos espera.

**La barra vive en un layout, no en cada página.** Al navegar, Next mantiene
los layouts y sólo reemplaza el contenido. Con la barra adentro de cada
página, el marco entero tenía que esperar al servidor.

**Cada pantalla tiene su esqueleto.** Sin un `loading.tsx`, Next no puede
mostrar *nada* de la pantalla nueva hasta que el servidor conteste entera: la
anterior se queda congelada y el clic parece perdido. Con él, la forma de la
pantalla aparece al instante.

**Y el token se verifica acá, no en Supabase.** El guardia de navegación usaba
`getUser()`, que gasta un viaje de red por cada clic. Ahora usa `getClaims()`,
que comprueba la firma con la clave pública del proyecto sin salir del
servidor. No se pierde seguridad —una cookie manipulada no pasa la
verificación criptográfica— y el refresco del token sigue igual.

Una página pública sin cookie de sesión ni siquiera crea el cliente de
Supabase: quien abre el enlace de su turno no necesita nada de eso, y suele
ser quien peor conexión tiene.

## Lo que todavía no está

- **Varias sucursales.** El modelo las contempla —`branches` existe y todo
  cuelga de ahí— pero las pantallas asumen la principal.
- **Monitoreo.** Si el emisor se traba a las tres de la mañana, nadie se
  entera hasta que falta un mensaje. Ya pasó una vez y se descubrió tarde.
  Existe `rpc_avisos_diagnostico`, pero hay que ir a preguntarle.
- **Respaldos propios.** Hoy son los del plan de Supabase.
