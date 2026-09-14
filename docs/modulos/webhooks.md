# Webhooks de WhatsApp

## Qué es

Lo que Meta nos avisa: si un mensaje llegó y lo leyeron, qué contestó la
cliente, y cómo viene la salud del número.

Cierra el circuito. Hasta acá sabíamos que un mensaje **salió**; ahora sabemos
qué pasó después.

## Por qué importa, en orden de gravedad

### 1. La cuenta

Meta mide la reacción de la gente. Si demasiadas personas bloquean o reportan,
la calidad del número cae y la cuenta termina limitada.

**La tasa de lectura es la señal temprana**, y sin webhooks no existe. Una tasa
sana ronda el 65–80 %. El panel avisa por debajo del 50 %, que es mucho antes
de que Meta haga algo.

Y si Meta marca el número en rojo, **se frena todo automáticamente** y se
cancela lo que quedaba en la cola. Seguir enviando desde una cuenta en rojo es
el camino directo a que la limiten.

### 2. Las bajas

Alguien que contesta "BAJA", "no me escriban más" o "STOP" deja de recibir ese
mismo minuto. Se reconocen trece variantes, sin acentos y sin importar
mayúsculas ni espacios.

Una baja ignorada no es un error de producto: es una denuncia, y las denuncias
son lo que tira abajo la calidad de la cuenta.

### 3. La autogestión

Un cliente que toca **"Confirmar turno"** en el propio recordatorio actualiza
la agenda sola. Es un mensaje menos que alguien tiene que leer y ejecutar a
mano, que es exactamente el ahorro de tiempo que el producto promete.

Si toca **"Quiero reprogramar"**, el turno **no se toca**: queda una nota en su
ficha para que alguien lo resuelva. Mover un turno solo sería peor que no hacer
nada.

## Las dos reglas del webhook

### Se verifica la firma

Cada aviso viene con `X-Hub-Signature-256`: el HMAC SHA-256 del cuerpo con el
`app_secret` del negocio. Sin verificarlo, cualquiera que conozca la URL
podría inventar estados de entrega, dar de baja clientes o confirmar turnos
ajenos.

Dos detalles que parecen menores y no lo son:

- Se firma el **cuerpo crudo**. Volver a serializar el JSON cambia los bytes y
  la firma no da.
- Se compara en **tiempo constante**. Salir ante la primera diferencia filtra
  información sobre cuál era la firma correcta.

### Se responde 200 rápido

Meta reintenta lo que no contesta a tiempo. El procesamiento va **después** de
responder, con `EdgeRuntime.waitUntil`.

Y como los reintentos existen, todo es idempotente: `whatsapp_inbound` tiene un
índice único sobre el identificador del mensaje, y si ya se procesó se sale
temprano. Sin eso, un cliente podría quedar dado de baja dos veces o recibir
dos notas de "pidió reprogramar".

## Los estados avanzan, nunca retroceden

Meta manda los estados desordenados: puede llegar primero "leído" y después el
"entregado" que venía atrasado. Si ya sabemos que lo leyeron, un estado viejo
no puede borrar esa información.

| Estado | Qué guarda |
| --- | --- |
| `sent` | Nada: ya lo sabíamos al enviarlo |
| `delivered` | `delivered_at`, si estaba vacío |
| `read` | `read_at` y `delivered_at`, si estaban vacíos |
| `failed` | Marca el envío como fallado, con el motivo de Meta |

## Los botones

Una plantilla de WhatsApp puede llevar botones de respuesta rápida. Se declaran
**en Meta** al aprobar la plantilla; acá se guarda qué hace cada uno y en qué
orden, porque el contenido del botón lo mandamos nosotros en cada envío con el
identificador del turno adentro: `confirmar:<id del turno>`.

Cuando vuelve por el webhook, ese identificador es lo que permite actualizar el
turno correcto.

| Acción | Qué pasa al tocarlo |
| --- | --- |
| `confirmar` | El turno pasa a confirmado, si estaba pendiente |
| `reprogramar` | Queda una nota en la ficha. El turno no se toca |
| `baja` | Deja de recibir WhatsApp |

## Cómo se da de alta en Meta

1. En la app de Meta, configurar la URL del webhook:
   `https://<proyecto>.supabase.co/functions/v1/whatsapp-webhook`
2. Como token de verificación, el mismo que esté en
   `whatsapp_accounts.verify_token`.
3. Meta hace un `GET` con `hub.challenge` y la función lo devuelve si el token
   coincide.
4. Suscribirse a los campos `messages`, `account_update` y
   `message_template_quality_update`.
5. Guardar el `app_secret` de la app en `whatsapp_accounts.app_secret`: sin eso
   se rechaza todo aviso entrante.

## Probarlo localmente

```bash
npx supabase functions serve --no-verify-jwt
```

El handshake:

```bash
curl "http://127.0.0.1:54321/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=hola"
```

Un aviso firmado:

```bash
BODY='{"object":"whatsapp_business_account","entry":[...]}'
FIRMA=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "EL_APP_SECRET" -hex | sed 's/^.*= //')
curl -X POST http://127.0.0.1:54321/functions/v1/whatsapp-webhook \
  -H "content-type: application/json" \
  -H "x-hub-signature-256: sha256=$FIRMA" -d "$BODY"
```

Sin firma correcta responde 401.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| El webhook | `supabase/functions/whatsapp-webhook/index.ts` |
| Estados, salud y respuestas | `supabase/migrations/20260912150000_webhooks.sql` |
| Botones | `supabase/migrations/20260912160000_quick_replies.sql` |
| Pruebas | `tests/rls/webhooks.test.ts` |

## Lo que todavía no está

- **Consultar la salud proactivamente**: hoy se actualiza cuando Meta avisa. Un
  chequeo periódico daría el dato aunque no haya novedades.
- **Tasa de lectura por plantilla**: hoy es global. Por plantilla diría cuál
  reescribir.
- **Responder automáticamente** dentro de la ventana de 24 horas que abre la
  cliente al escribir.
