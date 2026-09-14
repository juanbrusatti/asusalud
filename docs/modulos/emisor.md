# Emisor

## Qué es

Lo que faltaba para que el motor sirva: alguien que **entregue** los mensajes
que el planificador deja en la cola.

Corre como Edge Function de Supabase y lo llama `pg_cron` cada minuto.

## La decisión más importante: el modo de prueba

**Toda negocio arranca sin poder enviar nada hacia afuera.**

En modo de prueba el sistema hace el recorrido completo —arma el texto, elige
el canal, valida que haya destinatario y credenciales, lo anota en la
bitácora— pero no sale un solo mensaje. Salir del modo de prueba es un acto
deliberado, con confirmación.

No es una comodidad de desarrollo: es la salvaguarda que evita que la primera
regla mal configurada le escriba a seis mil personas reales. De ahí no se
vuelve.

Y el modo de prueba **valida de verdad**: si falta el teléfono de un cliente o
el negocio no conectó WhatsApp, lo marca igual. Sirve para encontrar
problemas, no sólo para no molestar.

Cada envío queda marcado con `was_test`, así un mes de pruebas no se confunde
con un mes de envíos reales en los informes.

## El recorrido

```
pg_cron cada minuto
   └─ app.trigger_dispatch()        lee la URL del emisor de platform_settings
        └─ pg_net.http_post          con el secreto compartido
             └─ Edge Function dispatch
                  ├─ rpc_claim_due_jobs    toma los vencidos, SKIP LOCKED
                  │                         verifica topes y freno general
                  ├─ rpc_jobs_payload      todo lo necesario en una consulta
                  ├─ send()                según el canal
                  └─ rpc_finish_job        enviado, reintento o falla
```

### Va despacio a propósito

Meta permite ochenta mensajes por segundo. El emisor manda **de a uno, con una
pausa irregular de entre 1,5 y 4 segundos**.

Doscientos recordatorios en ráfaga son exactamente el patrón que termina en
bloqueo. Así se parece a una persona trabajando y no a una máquina vaciando
una lista. En modo de prueba no hay pausa: no hay nadie del otro lado a quien
cuidar.

## Los canales

| Canal | Proveedor | Estado |
| --- | --- | --- |
| Correo | Brevo | Listo |
| WhatsApp | Cloud API de Meta | Listo, falta conectar la cuenta |
| Notificación | Web Push | Pendiente |

### WhatsApp: lo que se manda no es el texto

Meta no recibe el mensaje escrito: recibe **el nombre de la plantilla aprobada
más sus parámetros numerados**. El orden de los parámetros lo define la
plantilla cargada en Meta y tiene que coincidir con el orden en que aparecen
los huecos en el texto que guardamos. Si no coincide, el cliente recibe los
datos cambiados de lugar.

El texto que guardamos sirve para dos cosas: extraer los parámetros en orden y
poder responder después "¿qué decía el mensaje que le llegó?".

### Correo: el remitente es el negocio

El nombre que se ve es el del negocio, no el nuestro. El cliente conoce a
Asusalud, no a Dlay.

## Errores: no todos se arreglan reintentando

| Tipo | Ejemplos | Qué hace |
| --- | --- | --- |
| **Permanente** | La ficha no tiene teléfono · el negocio no conectó WhatsApp · el mensaje no tiene nombre en Meta · Meta devuelve 4xx | Falla de una, con el motivo escrito en castellano |
| **Transitorio** | Meta devuelve 5xx · límite de velocidad · se cortó la red | Vuelve a la cola con espera creciente: 4, 16 y 64 minutos |

Después de tres intentos deja de insistir. Insistir sobre algo que no se
arregla solo es justo lo que degrada la reputación de la cuenta.

Los permanentes son los que alguien tiene que ir a resolver a mano, y por eso
el motivo está escrito para una persona y no para un programador.

## Las credenciales

`whatsapp_accounts` guarda el token de cada negocio y **no tiene ningún
permiso para `authenticated`**: ni siquiera el titular lo puede leer. Sólo llegan
el emisor y el webhook, que corren con permisos del sistema.

Para que el panel igual pueda mostrar el estado de la cuenta existe
`whatsapp_status`, una vista que corre con los permisos de su titular, devuelve
sólo las columnas inofensivas y filtra por negocio con `app.has_tenant()`.
Hacen falta las dos cosas: con `security_invoker` no devolvería nada, y sin el
filtro devolvería las cuentas de todas los negocios.

> Endurecimiento pendiente: mover el token a Supabase Vault. Hoy está en una
> tabla sin acceso, que ya es correcto, pero cifrarlo es mejor.

## Por qué los envoltorios `rpc_*`

El esquema `app` no se expone por la API a propósito: ahí viven los helpers de
seguridad. Pero el emisor es una Edge Function y habla por la API.

Por eso hay tres envoltorios mínimos en `public` —`rpc_claim_due_jobs`,
`rpc_jobs_payload`, `rpc_finish_job`— con permiso **exclusivo para
`service_role`**. `authenticated` y `anon` no los pueden ni ver.

## Configuración

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `BREVO_API_KEY` | Edge Function | Enviar correos |
| `MAIL_FROM` | Edge Function | Dirección remitente verificada |
| `DISPATCH_SECRET` | Edge Function | Que sólo el reloj pueda llamarlo |
| `DISPATCH_BATCH` | Edge Function | Cuántos por corrida. Por defecto 20 |
| `DISPATCH_MIN_MS` / `DISPATCH_MAX_MS` | Edge Function | La pausa entre envíos |

Y en la base, tabla `platform_settings`:

| Clave | Valor |
| --- | --- |
| `dispatch_url` | URL de la Edge Function |
| `dispatch_secret` | El mismo secreto |

Si `dispatch_url` no está cargada, el reloj no hace nada en lugar de llenar el
log de errores cada minuto.

## Probarlo localmente

```bash
npm run db:start
npx supabase functions serve --no-verify-jwt
```

Después, con los envíos ya planificados:

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/dispatch \
  -H "x-dlay-secret: secreto-local" -d '{}'
```

Devuelve `{"tomados":N,"enviados":N,"fallados":N}`.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| El emisor | `supabase/functions/dispatch/index.ts` |
| Los canales | `supabase/functions/_shared/channels.ts` |
| Armado del mensaje | `supabase/functions/_shared/render.ts` |
| Credenciales, payload y cierre | `supabase/migrations/20260912100000_emisor.sql` |
| Envoltorios de la API | `supabase/migrations/20260912120000_dispatch_rpc.sql` |
| Errores permanentes | `supabase/migrations/20260912130000_permanent_errors.sql` |
| El reloj del emisor | `supabase/migrations/20260912110000_dispatch_schedule.sql` |
| Pruebas | `tests/unit/render.test.ts`, `tests/rls/reminders.test.ts` |

## Lo que todavía no está

- **Webhooks de Meta**: entregado, leído, fallido, y las respuestas de la
  cliente. Sin esto no hay tasa de lectura ni corte automático por calidad.
- **Notificaciones push**: el canal más barato de los tres y el único que
  falta.
- **Corte automático por calidad**: el panel ya avisa si Meta marca la cuenta
  en rojo, pero nadie actualiza ese dato todavía.
- **Tope de gasto mensual**: el campo existe, falta que el emisor lo mire.
- **Token en Vault**.
