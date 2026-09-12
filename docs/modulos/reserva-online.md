# Reserva online

## Qué es

La página pública donde una clienta saca turno sola, a cualquier hora, sin que
nadie tenga que contestarle.

Vive en `/r/<slug de la estética>` y es lo único del sistema pensado para
alguien **sin cuenta**.

## La regla de seguridad más estricta del proyecto

> **`anon` no tiene acceso a ninguna tabla. Ni una.**

Habla exclusivamente con tres funciones que devuelven lo justo para reservar:
qué servicios hay, qué horarios quedan libres, y el resultado de reservar.

Nunca un nombre, nunca un teléfono, nunca un turno ajeno. Ni siquiera "ocupado
por Fulana": sólo **qué horarios quedan**. Hay una prueba que recorre ocho
tablas como visitante y verifica que todas responden permiso denegado.

Dos detalles de la misma familia:

- El **precio sólo viaja** si la estética eligió mostrarlo. No se manda al
  navegador para ocultarlo con CSS.
- Una estética que no existe y una que todavía no abrió su agenda dan **la
  misma respuesta**. Distinguirlas filtra información que no hace falta dar.

## Cómo se calcula un horario libre

Un horario está disponible cuando se cumple **todo**:

1. Cae dentro de una franja de atención de ese día.
2. El turno entero termina antes de que cierre. La limpieza puede quedar afuera
   del horario, la atención no.
3. No pisa un bloqueo de agenda.
4. **Cada servicio elegido tiene cupo** en ese rato. Si la depilación admite
   dos a la vez y hay una tomada, el horario se sigue ofreciendo.
5. Respeta la anticipación mínima y el horizonte máximo.

Los horarios se ofrecen cada 15 minutos por defecto, desde que abre. Con un
servicio de 40 minutos y cierre a las 19:00, el último que aparece es 18:15: el
siguiente ya no llegaría a terminar.

Varios servicios se suman. Elegir un masaje de 60 y una depilación de 40
necesita un hueco de 100 minutos, y el último horario posible se corre en
consecuencia.

## Al reservar

**La ficha se busca por teléfono.** Si existe, se reutiliza: no se duplica a
quien la estética ya tenía cargada. Y **no se pisa lo que había**: si la ficha
decía "Josefina" y la clienta escribe "Jose", queda "Josefina". Sólo se completa
lo que faltaba, como el correo.

Eso importa porque la ficha puede tener un aviso cargado —"alérgica a la
lidocaína"— que una reserva online no puede borrar.

**El teléfono se normaliza** con la misma función que usa el resto del sistema,
así que la ficha creada desde la web queda igual que cualquier otra y los
recordatorios le llegan.

**El turno queda marcado como `online`**, que lo distingue de los cargados en
el mostrador.

### El freno contra quien reserva media agenda

Una misma persona puede tener como mucho tres turnos a futuro, configurable. No
es paranoia: una agenda pública sin ese límite se llena de turnos fantasma en
una tarde.

### Cuando dos personas eligen el mismo horario

La verificación de cupos es un trigger diferido que normalmente corre al cerrar
la transacción. Si se dejara así, el error saltaría **después** de que la
función terminó, fuera de su manejador, y la clienta vería un error crudo de
base de datos.

Por eso `booking_create` fuerza la verificación adentro, la traduce a *"Justo
alguien tomó ese horario. Elegí otro, por favor."*, y deshace todo lo que había
hecho. No queda ningún turno ni ninguna ficha a medias.

> Detalle que costó un bug: después de forzarla hay que **volver a diferirla**.
> El modo queda fijado para toda la transacción, y si quedara en inmediato, una
> segunda reserva en el mismo pedido se verificaría antes de que existan sus
> servicios.

## Los horarios de atención

`business_hours` no existía hasta ahora a propósito: no había quién la
consumiera. Varias filas por día permiten cortar al mediodía —una franja de 9 a
13 y otra de 16 a 20— que es como trabajan muchas estéticas.

Toda estética nueva nace con lunes a viernes de 9 a 19 y la **agenda pública
apagada**: abrirla al público es una decisión, no un estado por defecto.

## Los ajustes

| Ajuste | Por defecto | Para qué |
| --- | --- | --- |
| Anticipación mínima | 2 horas | Que nadie saque turno para dentro de diez minutos |
| Horizonte | 60 días | Hasta cuándo se puede reservar |
| Cada cuánto | 15 minutos | La grilla de horarios que se ofrece |
| Mostrar precios | Sí | Si el precio viaja al navegador |
| Turnos abiertos por persona | 3 | El freno contra la agenda fantasma |

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Horarios y ajustes | `supabase/migrations/20260912190000_horarios.sql` |
| Las tres funciones públicas | `supabase/migrations/20260912200000_reserva_publica.sql` |
| Consultas | `src/lib/data/reserva.ts` |
| Reservar | `src/lib/actions/reserva.ts` |
| La página | `src/app/r/[slug]/` |
| Pruebas | `tests/rls/reserva.test.ts` |

## Después de reservar

La pantalla de confirmación entrega el **enlace del turno**: desde ahí la
clienta lo mueve o lo cancela sola, sin escribirle a nadie. Está documentado en
[El turno de la clienta](autogestion.md).

Es el momento en que más probabilidades hay de que lo guarde: lo tiene en la
mano y le acaba de importar.

## Lo que todavía no está

- **Señas por Mercado Pago**, para bajar el ausentismo. Fase 3.
- **Pedir las notificaciones push** en el paso final, que es el único momento en
  que una clienta tiene motivo para aceptarlas.
- **Límite por IP**: hoy el freno es por teléfono, que alcanza para el uso real
  pero no para alguien decidido a molestar.
