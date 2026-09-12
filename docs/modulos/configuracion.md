# Configuración

## Qué es

Las cuatro pantallas donde la estética maneja cómo funciona por dentro, sin
que nadie tenga que tocar la base de datos.

Se toca poco y nada: casi todo se configura una vez y no se vuelve a mirar.

| Sección | Qué decide |
| --- | --- |
| Tu estética | Nombre, dirección y **zona horaria** |
| Horarios de atención | Qué días y en qué franjas se atiende |
| Reserva online | Si las clientas pueden sacar turno solas y con qué reglas |
| Envío de mensajes | Franja de envío, topes por persona y tope de gasto |

Sólo entran dueña y administración: son decisiones de negocio.

## La zona horaria es el ajuste más peligroso

Define a qué hora empieza y termina cada día, y cuándo sale cada recordatorio.
Si está mal, **los turnos aparecen en el día equivocado** y los avisos salen a
cualquier hora.

Por eso la lista ofrece diez zonas —las de Argentina y las de los países
vecinos— y no las cuatrocientas del mundo. Elegir mal entre diez es difícil;
entre cuatrocientas, inevitable.

## Horarios: varias franjas por día

Cada día puede tener más de una franja. Es lo que permite **cortar al
mediodía**, que es como trabajan muchas estéticas: de 9 a 13 y de 16 a 20.

Un día sin franjas queda cerrado.

Al agregar una franja nueva, arranca donde terminó la anterior: es lo que casi
siempre se quiere después de un corte.

### Se valida antes de guardar

| Qué se revisa | Por qué |
| --- | --- |
| Que ninguna termine antes de empezar | Un error de tipeo dejaría el día roto |
| Que dos del mismo día no se pisen | Dejaría horarios duplicados en la reserva online |

Si algo no cierra, **no se guarda nada**: el horario que había queda intacto.

### Se borra todo y se reescribe

Son pocas filas y así no hay que reconciliar cuáles cambiaron, cuáles se
agregaron y cuáles se sacaron. Todo dentro del mismo pedido, así que la agenda
nunca queda a medias.

## Reserva online

Lo más importante de esta pantalla no es un campo: es que la agenda **nace
cerrada**. Se puede dejar todo configurado —horarios, precios, texto de
bienvenida— y abrirla recién cuando esté lista.

Si no hay horarios cargados, la pantalla lo avisa: abrir la agenda sin
horarios no ofrecería ni un turno, y eso es peor que tenerla cerrada.

## Envío de mensajes

Los límites que **ninguna regla de recordatorio puede saltear**. Están para que
un error de configuración no termine en una clienta recibiendo diez mensajes.

- **Franja de envío**: fuera de ella no sale nada. Lo que venza de madrugada
  espera a la mañana.
- **Tope por persona**, por día y por semana: la red de seguridad cuando hay
  varias reglas activas que caen el mismo día.
- **Tope de gasto mensual**: sólo cuentan los WhatsApp. El correo y las
  notificaciones no cuestan nada.

El tope semanal no puede ser menor que el diario, y se avisa si alguien lo
intenta.

## WhatsApp queda afuera

Conectar el número es un trámite con Meta que hace la dueña de la estética, no
el sistema. La pantalla lo dice y no pretende resolverlo con un campo de texto.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Tipos y listas | `src/lib/configuracion.ts` |
| Consultas | `src/lib/data/configuracion.ts` |
| Guardado y validaciones | `src/lib/actions/configuracion.ts` |
| Pantallas | `src/app/configuracion/` |

> `src/lib/configuracion.ts` está separado del módulo de consultas porque los
> formularios son componentes de cliente: si importaran las listas de ahí,
> arrastrarían `next/headers` al navegador y el build falla.

## Lo que todavía no está

- **Más de una sucursal**: las pantallas asumen la principal.
- **Horarios por profesional**, distintos de los del local.
- **Feriados**: por ahora se resuelven bloqueando la agenda desde la agenda.
- **Conexión de WhatsApp**, que se hace al final y con acompañamiento.
