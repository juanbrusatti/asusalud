# Notificaciones push

## Qué es

El canal más barato de los tres, y el único verdaderamente gratis e ilimitado.
Cada recordatorio que sale por acá en lugar de WhatsApp son **$37,68 que la
negocio no gasta**.

Funciona con Web Push estándar: el navegador guarda una suscripción y el
servidor le manda avisos cifrados, sin intermediarios ni costo por mensaje.

## Dos públicos que conviene no confundir

**El equipo.** Instala la aplicación en el teléfono y se entera al momento
cuando entra una reserva o alguien cancela, sin tener que estar mirando la
agenda. La adopción es alta: usan el sistema todos los días.

**Los clientes.** Sólo las que acepten notificaciones al reservar online. La
adopción va a ser baja —la mayoría no instala la aplicación de su negocio—
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

## Avisos al equipo

Una reserva que entra a las once de la noche y una cancelación del cliente
son las dos cosas que se descubrían al día siguiente, mirando la agenda.
Avisar en el momento es lo que convierte una cancelación en un horario que
todavía se puede volver a vender.

| Qué pasó | Qué llega |
| --- | --- |
| Reserva online nueva | `Reserva nueva` · nombre, día, hora y servicio |
| El cliente cancela desde su enlace | `Cancelaron un turno` · y que el horario quedó libre |
| El cliente mueve su turno | `Movieron un turno` · de qué horario a qué horario |

### Sólo avisa lo que no hizo el equipo

Si la recepcionista carga un turno o cancela uno, **no llega nada**: ya lo
sabe, lo acaba de hacer. Avisarle a alguien de sus propios actos es la forma
más rápida de que apague las notificaciones para siempre.

Por eso el alta sólo avisa cuando `source = 'online'`, y la cancelación y la
reprogramación sólo cuando las hizo el cliente desde el enlace de su turno.

### El aviso espera a que el turno esté completo

El trigger del alta es **diferido**: corre al cerrar la transacción. Un trigger
normal corre antes de que existan los servicios del turno —se insertan después,
en la misma transacción— y el aviso salía sin decir qué se reservó, que es
justo el dato que hace falta para decidir sin abrir la aplicación.

### La cola es también una bitácora

`team_alerts` guarda qué se avisó, cuándo y si se pudo entregar. No se edita ni
se borra: si se pudiera, dejaría de servir para discutir si el aviso llegó.

- Si **nadie del equipo** tiene las notificaciones activadas, no se encola nada.
  Una cola de avisos que nunca van a poder entregarse es basura que hay que
  limpiar después.
- A los **tres intentos** se deja de probar: un aviso que llegara entonces ya no
  serviría.
- Alcanza con que llegue a **un dispositivo**. El equipo comparte la
  información; no hace falta que suene en todos.

### Salen en el momento, no en la próxima vuelta del reloj

Encolar un aviso despierta al emisor por `pg_net`. El reloj de cada minuto
queda como red de seguridad. Un recordatorio que sale un minuto más tarde da
igual; "acaba de entrar una reserva" enterado media hora después ya no es un
aviso, es una noticia.

## Los clientes, desde su turno

El ofrecimiento aparece en dos lugares: al terminar de reservar online —el
único momento en que un cliente tiene un motivo real para aceptar— y en la
pantalla de su turno.

La llave es el **token del turno**, no un identificador de cliente.
`register_push_subscription` acepta el `client_id` que se le pase, y por eso
sigue estando prohibida para quien no tiene sesión: si `anon` pudiera llamarla,
cualquiera podría suscribir su navegador a los recordatorios de otra persona.
Eso estuvo abierto y se cerró; está contado en
[Seguridad](../seguridad.md).

Donde no puede funcionar —un iPhone sin la aplicación en la pantalla de inicio,
un navegador sin soporte, un permiso ya denegado— **no se muestra nada**.
Ofrecer algo que no va a andar es peor que no ofrecerlo.

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

## Cómo se activan

Instalar la aplicación y prender los avisos son las dos cosas que se hacen una
sola vez, al principio. Si no están a la vista no las hace nadie: quedan
escondidas en un menú del navegador que la mayoría nunca abre.

Por eso hay una tarjeta arriba de todo en el inicio, **antes** que cualquier
otra cosa. Cuando las dos están resueltas se reduce a dos líneas; si en ese
navegador no se puede hacer ninguna, no aparece.

### El aviso de instalación se pierde si nadie lo escucha

El navegador avisa **una sola vez** que la aplicación se puede instalar, y lo
hace apenas termina de cargar la página: muchas veces antes de que React monte
nada. Sin nadie escuchando en ese momento el aviso se pierde y el botón no
aparece nunca.

Por eso se guarda en un script del `layout` que corre antes que todo lo demás,
y el botón lo busca cuando monta.

### En iPhone no hay botón

Apple no expone ninguna forma de instalar por código. Lo único posible es
explicar el camino —Compartir → Agregar a inicio—, y ahí importa decirlo:
**en iPhone la aplicación agregada es la condición para recibir
notificaciones**, así que quien se saltea ese paso no recibe ninguna.

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
| Avisos al equipo y suscripción del cliente | `supabase/migrations/20260913100000_avisos.sql` |
| Envío de los avisos | `supabase/functions/_shared/alerts.ts` |
| Ofrecerlas al cliente | `src/components/pwa/avisos-cliente.tsx` |
| Adaptador del emisor | `supabase/functions/_shared/channels.ts` |
| Recibir y abrir | `public/sw.js` |
| Pedir el permiso al equipo | `src/components/pwa/notificaciones.tsx` |
| Instalar la aplicación | `src/components/pwa/instalar.tsx` |
| La tarjeta del inicio | `src/components/pwa/tenela-a-mano.tsx` |
| Guardar la suscripción | `src/lib/actions/push.ts` |
| Generar las claves | `scripts/vapid.mjs` |

## Lo que todavía no está

- **Preferencias por tipo de aviso**: hoy es todo o nada. Quien quiere
  enterarse de las cancelaciones pero no de cada reserva no tiene cómo.
- **Probado de punta a punta**: el runtime de Edge Functions no levanta en el
  entorno local de este proyecto, así que el envío real —el paso que va de la
  cola al teléfono— todavía no se ejecutó nunca. Lo que sí está probado es todo
  lo que pasa en la base.
- **Un resumen en pantalla** de los avisos, para quien no los tenía activados
  cuando pasaron.
- **Ofrecerle el horario liberado** a otro cliente cuando entra una
  cancelación.
