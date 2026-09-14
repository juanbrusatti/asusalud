# Base de datos

Postgres 17 en Supabase. Migraciones en `supabase/migrations`, aplicadas en
orden por nombre.

## Regla de oro

**Toda tabla de negocio lleva `tenant_id` desde su primera migración.**
Agregarlo después es reescribir el sistema entero.

## Esquemas

| Esquema | Qué contiene | Expuesto por la API |
| --- | --- | --- |
| `public` | Tablas de negocio y funciones que llama la app | sí |
| `app` | Helpers de RLS, triggers y auditoría | **no** |
| `auth` | Usuarios y sesiones, lo maneja Supabase | no |

## Tablas de la fase 0

### `tenants`
Una fila por negocio. Raíz del aislamiento.

`timezone` define cuándo empieza y termina "hoy" para ese negocio. El cierre
de caja y la hora a la que sale cada recordatorio se calculan en esa zona,
nunca en UTC.

El `slug` es la identidad pública (`dlay.app/asusalud`) y tiene un índice único
sobre `lower(slug)`.

### `branches`
Sucursales. Asusalud arranca con una, pero la agenda, el stock y la caja ya
cuelgan de acá para que abrir la segunda no sea una migración. Un índice
parcial garantiza **exactamente una sucursal por defecto** por negocio.

### `profiles`
Datos públicos de un usuario, espejo de `auth.users`. La app nunca consulta
`auth.users`: guarda credenciales y no lleva RLS propia. El trigger
`on_auth_user_created` crea el perfil al registrarse.

### `memberships`
Qué persona pertenece a qué negocio y con qué rol. **Es la tabla que gobierna
todo el aislamiento**: si no hay fila, esa persona no ve nada de ese negocio.

Una persona puede ser titular de un negocio y recepción en otra: por eso el rol
vive acá y no en el usuario.

| Rol | Alcance |
| --- | --- |
| `owner` | Control total, incluida la facturación |
| `admin` | Gestión completa sin facturación |
| `reception` | Agenda y clientes de todos, sin caja ni configuración |
| `staff` | Su propia agenda y sus clientes |

### `audit_log`
Append-only. La escriben triggers y sólo se lee. Nadie la edita ni la borra
desde la aplicación.

## Funciones

| Función | Esquema | Para qué |
| --- | --- | --- |
| `create_tenant(name, slug)` | `public` | **Único** camino para dar de alta un negocio |
| `app.tenant_ids()` | `app` | Negocios del usuario actual |
| `app.has_tenant(uuid)` | `app` | Pertenencia |
| `app.has_role(uuid, ...)` | `app` | Pertenencia con rol |
| `app.shares_tenant(uuid)` | `app` | Compañeros de equipo |

### Por qué `create_tenant` es una función

Huevo y gallina: para insertar en `tenants` hay que pertenecer al negocio, y
para pertenecer tiene que existir. La función crea negocio, membresía de titular
y sucursal principal en una sola transacción. `tenants` **no tiene política de
INSERT** justamente para que no haya otro camino.

## Salvaguardas

Dos triggers cubren reglas que una política RLS no puede expresar, porque
necesitan comparar el estado viejo con el nuevo:

| Trigger | Impide |
| --- | --- |
| `guard_last_owner` | Que un negocio se quede sin titular activo, por borrado o por cambio de rol |
| `guard_owner_escalation` | Que un admin se fabrique un owner, o ascienda a alguien |

Los dos se desactivan solos cuando el negocio entera se está borrando en
cascada: preguntan si la fila padre todavía existe.

## Tablas de la fase 1

### `services`, `service_categories`, `service_price_history`

El catálogo. Detalle completo en [Servicios](modulos/servicios.md).

Tres cosas que conviene saber sin abrir ese documento:

- **`capacity`**: turnos simultáneos que admite el servicio. Es lo que hoy
  Asusalud hace superponiendo turnos a mano.
- **`price_cents`** es un entero. Nunca decimales de punto flotante para plata.
- **`price_mode`** distingue un precio "a convenir" de un precio faltante. La
  restricción `services_price_matches_mode` impide que se mezclen.

Los servicios **no se borran**: se desactivan, porque los turnos históricos los
referencian. El historial de precios lo escribe un trigger y sólo lo leen owner
y admin.

### `clients`, `client_tags`, `client_tag_assignments`, `client_notes`

Las fichas. Detalle completo en [Clientes](modulos/clientes.md).

Lo que conviene saber sin abrir ese documento:

- **`phone_e164` y `phone_raw`**: el normalizado y el original. WhatsApp exige
  el `9` en los celulares argentinos, así que un número guardado sin él no
  recibe nada.
- **El teléfono no es único**: en un negocio se comparten números. Los
  repetidos se muestran con `count_phone_duplicates()`, no se prohíben.
- **`search_text`** es una columna generada, sin acentos y en minúsculas, con
  índice GIN de trigramas. Es lo que hace que buscar entre miles de fichas sea
  instantáneo. Usa `app.immutable_unaccent()` porque `unaccent` es STABLE y una
  columna generada exige inmutabilidad.
- **`legacy_*`**: métricas traídas del sistema anterior, separadas a propósito
  de lo que calculemos nosotros.
- **Las notas no tienen GRANT de UPDATE**: se agregan, no se editan.

### `appointments`, `appointment_services`, `appointment_status_history`, `agenda_blocks`

La agenda. Detalle completo en [Agenda](modulos/agenda.md).

Lo que conviene saber sin abrir ese documento:

- **`ends_at` vs `blocks_until`**: el primero es cuando termina la atención, el
  segundo incluye la limpieza. La verificación de cupos usa el segundo.
- **Los cupos los verifica un trigger diferido** con `pg_advisory_xact_lock`
  por servicio. El bloqueo no es paranoia: sin él, dos reservas simultáneas
  pasarían las dos.
- **`price_cents` es una foto** del precio al agendar.
- **`public.book_appointment()`** es el único camino para agendar desde la
  aplicación: turno y servicios en una sola transacción, porque las
  verificaciones diferidas corren al cerrar y dos llamadas HTTP son dos
  transacciones.
- Los turnos **no se borran**, se cancelan. Sólo el titular tiene permiso de
  DELETE, y para casos de error grosero.

## Trabajar con migraciones

```bash
npm run db:reset      # borra y reaplica todo
npm run db:types      # regenera los tipos de TypeScript
npm test              # verifica que el aislamiento siga en pie
```

Las migraciones **no se editan después de estar en producción**: se agrega una
nueva. Mientras el proyecto no esté desplegado, editar y resetear es correcto.

## Lo que viene

Fases siguientes: `services`, `clients`, `client_channels`, `appointments`,
`reminder_rules`, `message_jobs`, `cash_sessions`, `products`. Todas con
`tenant_id`, RLS y su prueba de aislamiento.
