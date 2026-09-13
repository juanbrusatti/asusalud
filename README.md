# Dlay Estética

SaaS de gestión para estéticas: agenda, clientes, servicios, caja, stock y
—sobre todo— **recordatorios automáticos que no hacen que te bloqueen el
WhatsApp**.

Cliente piloto: Estética Asusalud (Río Cuarto, Córdoba).

## Estado

**Fase 0 · Cimientos** — terminada.

| Fase | Contenido | Estado |
| --- | --- | --- |
| 0 | Proyecto, sistema de diseño, PWA, multi-tenant, RLS y pruebas de aislamiento | ✅ |
| 1 | Servicios, clientes, importador y agenda | ✅ |
| 2 | Canales, motor de reglas, emisor, webhooks y reserva online | ✅ |
| 3 | Caja ✅ · señas e informes | 🔨 |
| 4 | Stock, reseñas y campañas | ⏳ |
| 5 | Planes, landing y alta automática | ⏳ |

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions)
- **Supabase** — Postgres, Auth, RLS, Storage y, más adelante, `pg_cron` para
  el scheduler de recordatorios
- **Tailwind 4** con los tokens de la identidad Dlay
- **PWA** instalable, con service worker propio
- **Vitest** para la suite de aislamiento, que habla directo con Postgres

## Cómo levantarlo

Hace falta **Docker** corriendo (Supabase local) y **Node 20 o superior**.

```bash
npm install
npm run db:start      # levanta Postgres, Auth y Storage; aplica migraciones
cp .env.example .env.local
```

`npm run db:start` imprime las claves del proyecto local. Copiá `ANON_KEY` a
`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SERVICE_ROLE_KEY` a
`SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.

```bash
npm run dev           # http://localhost:3000
```

Entrá, creá una cuenta y después tu estética. Los correos de prueba se ven en
Mailpit: http://127.0.0.1:54324

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Pruebas de aislamiento y de zonas horarias |
| `npm run db:start` / `db:stop` | Supabase local |
| `npm run db:reset` | Borra y reaplica todas las migraciones |
| `npm run db:types` | Regenera `src/lib/supabase/types.ts` desde el esquema |
| `npm run lint` | ESLint |

**Después de tocar una migración**: `npm run db:reset && npm run db:types && npm test`.

## Regla que no se negocia

> Ninguna funcionalidad que toque datos se da por terminada sin su prueba de
> aislamiento en `tests/rls/`.

La prueba se autentica como la estética A e intenta leer o escribir sobre la
estética B. Si devuelve una sola fila, la función no está lista.

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Base de datos](docs/base-de-datos.md)
- [Seguridad](docs/seguridad.md)
- [Variables de entorno](docs/variables-de-entorno.md)
- [Sistema de diseño](docs/diseno.md)

### Módulos

- [Servicios](docs/modulos/servicios.md)
- [Clientes](docs/modulos/clientes.md)
- [Agenda](docs/modulos/agenda.md)
- [Recordatorios](docs/modulos/recordatorios.md)
- [Emisor](docs/modulos/emisor.md)
- [Webhooks de WhatsApp](docs/modulos/webhooks.md)
- [Notificaciones push](docs/modulos/push.md)
- [Reserva online](docs/modulos/reserva-online.md)
- [El turno de la clienta](docs/modulos/autogestion.md)
- [Configuración](docs/modulos/configuracion.md)
- [Caja](docs/modulos/caja.md)
- [Informes](docs/modulos/informes.md)
