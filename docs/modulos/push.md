# Notificaciones push

## Qué es

El canal más barato de los tres, y el único verdaderamente gratis e ilimitado.
Cada recordatorio que sale por acá en lugar de WhatsApp son **$37,68 que la
estética no gasta**.

Funciona con Web Push estándar: el navegador guarda una suscripción y el
servidor le manda avisos cifrados, sin intermediarios ni costo por mensaje.

## Dos públicos que conviene no confundir

**El equipo.** Instala la aplicación en el teléfono y se entera al momento
cuando entra una reserva o alguien cancela, sin tener que estar mirando la
agenda. La adopción es alta: usan el sistema todos los días.

**Las clientas.** Sólo las que acepten notificaciones al reservar online. La
adopción va a ser baja —la mayoría no instala la aplicación de su estética—
pero cada una que acepta es una que **deja de costar plata para siempre**.

Por eso el pedido de permiso no se dispara apenas alguien entra. Aparece con
una explicación de para qué sirve y un botón: un permiso denegado no se puede
volver a pedir, así que gastarlo mal es perder ese canal en ese dispositivo.

## Cómo funciona

```
Navegador                    Dlay                        Servidor de push
   │ pide permiso             │                            │
   │ arma la suscripción      │                            │
   ├─────────────────────────►│ register_push_subscription │
   │                          │ guarda endpoint + claves   │
   │                          │                            │
   │                          │ emisor: canal "push"       │
   │                          ├───────────────────────────►│ cifrado con VAPID
   │◄──────────────────────────────────────────────────────┤
   │ service worker muestra   │                            │
```

Las claves que guarda la suscripción (`p256dh` y `auth`) son las que permiten
**cifrar el contenido**: sin ellas el servidor de push no entrega nada, y ni
siquiera el servidor de push puede leer el mensaje.

## Detalles que importan

### Una persona, varias suscripciones

Alguien puede tener el sistema instalado en el teléfono y en la computadora.
Son dos suscripciones distintas y el emisor le manda a todas: alcanza con que
una llegue para dar el envío por bueno.

### Las suscripciones muertas se borran solas

Un navegador que desinstaló la aplicación o limpió sus datos devuelve **410 o
404**. Esa suscripción se borra en el momento. Guardar suscripciones muertas
ensucia las métricas y hace más lento cada envío.

### El mismo turno no apila avisos

Cada notificación lleva el identificador del turno como etiqueta. Un aviso
nuevo del mismo turno **reemplaza** al anterior en lugar de sumarse. Tres
notificaciones apiladas del mismo turno es exactamente lo que hace que alguien
apague las notificaciones para siempre.

### Al tocarla se reutiliza la ventana

Si la aplicación ya está abierta, se enfoca esa. Abrir una segunda pestaña de
lo mismo es molesto y desorienta.

## Las claves VAPID

Se generan una sola vez por proyecto:

```bash
node scripts/vapid.mjs
```

| Clave | Dónde va | Quién la ve |
| --- | --- | --- |
| Pública | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | El navegador. Es pública por diseño |
| Privada | `VAPID_PRIVATE_KEY` en las Edge Functions | Nadie más |

> Si se cambian, **todas las suscripciones existentes dejan de funcionar** y
> cada persona tiene que volver a activarlas. No se rotan sin motivo.

## Compatibilidad

| Plataforma | Funciona |
| --- | --- |
| Android (Chrome, Firefox, Edge) | Sí |
| Escritorio (Chrome, Firefox, Edge, Safari) | Sí |
| iPhone y iPad | Sí, **sólo con la aplicación instalada** desde el navegador |

Lo de iOS no es un detalle menor: en iPhone hay que agregar la aplicación a la
pantalla de inicio antes de poder recibir notificaciones. Es una fricción real
y hay que contarla al pedir el permiso, no después.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Tabla y registro | `supabase/migrations/20260912170000_push.sql` |
| Adaptador del emisor | `supabase/functions/_shared/channels.ts` |
| Recibir y abrir | `public/sw.js` |
| Pedir el permiso | `src/components/pwa/notificaciones.tsx` |
| Guardar la suscripción | `src/lib/actions/push.ts` |
| Generar las claves | `scripts/vapid.mjs` |

## Lo que todavía no está

- **Avisos al equipo cuando pasa algo**: la infraestructura está, falta
  dispararlos ante una reserva nueva o una cancelación.
- **Pedirlas en la reserva online**, que es el único momento en que una clienta
  tiene motivo para aceptarlas.
- **Preferencias por tipo de aviso**: hoy es todo o nada.
