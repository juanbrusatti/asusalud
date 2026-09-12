# El turno de la clienta

## Qué es

Cada turno tiene su propia dirección web. Quien la tiene puede **confirmar,
mover el horario o avisar que no viene**, sin llamar, sin escribir y sin
esperar a que alguien conteste.

Vive en `/t/<token>` y es, junto con la reserva online, lo único del sistema
pensado para alguien **sin cuenta**.

## Qué problema resuelve

Hoy, para mover un turno, la clienta escribe, alguien lee, alguien contesta,
alguien cancela a mano y alguien agenda de nuevo. **Son cuatro pasos de una
persona** para algo que la clienta podría hacer sola en diez segundos.

Y el costo no es sólo el tiempo: el horario liberado tarda horas en volver a
ofrecerse, cuando ya nadie lo va a tomar.

## Tres decisiones que definen todo

### 1. El enlace es la llave

No hay cuenta ni contraseña. Pedirle a una clienta que se registre para avisar
que no puede venir es **garantizar que no avise**: va a seguir escribiendo por
WhatsApp, que es exactamente lo que se quería evitar.

El enlace lleva un token propio del turno, **distinto de su identificador**.
Ese identificador ya viaja en otros lados —los botones de las plantillas de
WhatsApp, las pantallas del equipo— y una llave que se puede correlacionar con
otra cosa deja de ser una llave.

> El token se genera solo al crear el turno, son 32 caracteres al azar y tiene
> índice único. `anon` no puede leerlo de la tabla: sólo lo recibe quien
> reservó, y después viaja dentro de los recordatorios, a la misma persona.

### 2. Hay una hora de corte

Cancelar dos horas antes deja un hueco que no se llena con nadie. Por defecto
son **24 horas**, y lo decide cada estética.

Pasado el corte **no se dice "no"**: se muestra el teléfono de la estética y se
explica que avisar igual sigue siendo lo mejor, porque cuanto antes se sepa más
chances hay de que alguien ocupe el lugar. Una puerta cerrada sin timbre logra
que la persona escriba lo mismo, más tarde y de peor humor.

### 3. Reprogramar tiene límite

Sin tope, un solo turno puede pasearse por la agenda toda la semana. Por
defecto, **dos veces**. El equipo puede moverlo las que quiera: el tope es sólo
para la autogestión.

## Qué puede hacer

| Acción | Cuándo aparece |
| --- | --- |
| **Confirmar que voy** | El turno está sin confirmar y todavía no pasó |
| **Cambiar el día o el horario** | Antes del corte y con cambios disponibles |
| **No voy a poder ir** | Antes del corte |

Al mover el turno se ofrecen los horarios libres con **exactamente el mismo
cálculo que la reserva online**: franjas de atención, bloqueos de agenda y cupo
por servicio. La única diferencia es que el turno **se ignora a sí mismo**; si
no, taparía el horario que ocupa hoy y no se podría correr media hora.

Ese cálculo vive en una sola función, `app.free_slots()`, que usan las dos
pantallas. Duplicar sesenta líneas de lógica sutil por esa única diferencia es
la forma segura de que un día dejen de coincidir.

## Lo que ve la estética

El turno cambia en la agenda **en el momento**, sin que nadie toque nada. Y el
historial del turno dice quién lo hizo:

```
Reprogramado por la clienta: venía del 14/09 01:15
La clienta · 12-sept, 06:40 p. m.
```

Sin eso, una cancelación hecha por la clienta figuraría como "alguien del
equipo", que es justo lo contrario de lo que pasó. La columna `by_client` lo
distingue, y el autor queda en nulo aunque haya una sesión abierta: puede pasar
que la dueña abra el enlace de su clienta desde su propio teléfono, y anotarla
a ella como quien canceló sería mentir.

Mover un turno **no cambia su estado**, así que el trigger del historial no
escribe nada por su cuenta: la fila se inserta a mano, porque si no el turno
aparecería en otro horario sin ninguna explicación.

## Cómo llega el enlace

Por dos caminos, y los dos importan:

1. **Al reservar online**, en la pantalla de confirmación. Es el momento en que
   la persona más probabilidades tiene de guardarlo: lo tiene en la mano y le
   acaba de importar.
2. **En los recordatorios**, con el hueco `{{link}}`. Funciona en los tres
   canales. Un aviso que no cuelga de un turno —un cumpleaños— lo deja vacío en
   lugar de mostrar el hueco.

La dirección base sale de `platform_settings.site_url`.

## Los ajustes

En **Ajustes → Reserva online**, bloque "Que se maneje sola":

| Ajuste | Por defecto | Qué hace |
| --- | --- | --- |
| Dejar que cambien su turno | Sí | El interruptor general |
| Hasta cuántas horas antes | 24 | La hora de corte |
| Cuántas veces puede mover | 2 | El tope de reprogramaciones |
| Teléfono de contacto | — | Adónde escribir cuando ya es tarde |

**No depende de que la agenda pública esté abierta.** Son dos decisiones
distintas: una estética puede no querer que cualquiera saque turno por internet
y querer igual que su clienta pueda avisar sola que no viene.

Apagarlo no invalida los enlaces: siguen mostrando el turno, sin botones.

## Seguridad

Se mantiene la regla más estricta del proyecto: **`anon` no tiene acceso a
ninguna tabla**. Cinco funciones más, y nada más que eso.

- `booking_manage` devuelve **el nombre de pila y nada más** de la ficha. Es
  para que quien abre el enlace reconozca que el turno es suyo; el apellido, el
  teléfono y el identificador de la clienta no viajan.
- Un token inventado y un turno de una estética dada de baja dan **la misma
  respuesta**.
- La hora de corte, el tope de cambios y el estado del turno los decide **la
  base**, no la pantalla: valen aunque alguien llame a las funciones a mano.
- Un intento de mover el turno que choca con otro **no gasta un cambio**.
- La página va con `robots: noindex`. Un enlace que es una llave no tiene por
  qué terminar en un buscador.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Token, ajustes y las cinco funciones | `supabase/migrations/20260912260000_autogestion.sql` |
| Tipos y textos | `src/lib/autogestion.ts` |
| Lectura | `src/lib/data/autogestion.ts` |
| Confirmar, cancelar y mover | `src/lib/actions/autogestion.ts` |
| Pantalla | `src/app/t/[token]/` |
| Ajustes | `src/app/configuracion/reservas/form.tsx` |
| Pruebas | `tests/rls/autogestion.test.ts` |

## Lo que todavía no está

- **Avisarle al equipo** cuando alguien cancela o mueve: la infraestructura de
  notificaciones push está, falta dispararlas. Hoy el cambio se ve entrando a
  la agenda.
- **Ofrecerle el horario liberado a otra persona**, que es el paso que
  convierte una cancelación en una recuperación.
- **Agregar o sacar un servicio** del turno: hoy sólo se mueve el horario.
- **Un enlace que sobreviva al turno**, para ver todos los turnos de una
  clienta y no sólo uno.
