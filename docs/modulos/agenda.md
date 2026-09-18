# Agenda

## Qué es

Los turnos: quién viene, a qué hora, qué se le hace y cuánto dura. Es donde se
cruzan los servicios y las fichas de clientes, y de donde va a salir todo lo
que venga después: los recordatorios, la caja y los informes.

## La decisión que define el módulo: los cupos simultáneos

Asusalud atiende a dos o tres personas a la vez. No es desorden: el aparato de
depilación trabaja solo mientras ellas atienden a otro cliente. En el sistema
anterior eso se resuelve superponiendo turnos a mano, sin que nada lo controle.

Acá cada servicio declara **cuántos turnos suyos pueden correr a la vez** y la
base se encarga:

| Servicio | Cupo | Qué significa |
| --- | --- | --- |
| Depilación definitiva | 2 | Dos personas en paralelo |
| Electrodos | 3 | Tres camillas a la vez |
| Masaje | 1 | Nadie masajea a dos personas |

Si el horario está completo, **no se agenda nada** y el mensaje lo dice con
todas las letras: *"No hay lugar a esa hora: Depilación Definitiva admite 2 a
la vez y ya están tomados."*

### Por qué la verificación vive en la base y no en el código

Dos razones, y las dos son de corrección, no de gusto:

1. **La carrera.** Dos reservas que llegan al mismo tiempo contarían cada una
   los turnos que había *antes* de la otra, las dos pasarían la verificación y
   el cupo quedaría excedido. El trigger toma un bloqueo por servicio antes de
   contar, así que la segunda espera y después se encuentra con que ya no hay
   lugar. Hay una prueba que abre dos transacciones en paralelo justamente
   para esto.
2. **La reserva online.** Cuando los clientes agenden por su cuenta, la regla ya va a
   estar puesta donde nadie la puede saltear.

### El cupo es por servicio

Un límite global por profesional sería la regla "real", pero hoy habría que
inventarla: con una sola profesional no hay forma de saber qué combinaciones
son posibles. Llega cuando haya varias.

## Qué información usa

| Dato | Notas |
| --- | --- |
| Cliente | Obligatoria. El turno sin ficha no existe |
| Servicios | Uno o varios, seguidos. Se conserva el orden en que se eligieron |
| Inicio | La hora local del negocio |
| Fin | Inicio más la suma de las duraciones |
| Bloquea hasta | Fin más la limpieza del servicio más largo |
| Estado | Sin confirmar, confirmado, atendida, no vino, cancelado |
| Precio | Suma de los servicios **al momento de agendar** |
| Nota | Sólo de ese turno |

### Fin y "bloquea hasta" no son lo mismo

`ends_at` es cuando termina la atención: es lo que ve el cliente.
`blocks_until` suma la limpieza y es lo que ocupa la agenda. Un turno de 09:00
a 09:40 con 10 minutos de limpieza deja libre recién las 09:50, y la
verificación de cupos usa ese segundo número.

### El precio es una foto

Un turno guarda cuánto costaba el servicio el día que se agendó. Si mañana
sube el precio, el turno de ayer no cambia. Sin esto, los informes de un mes
cerrado se moverían solos cada vez que alguien actualiza una lista de precios.

## Estados y qué provoca cada uno

| Estado | Ocupa lugar | Cuándo se usa |
| --- | :-: | --- |
| Sin confirmar | Sí | Agendado, falta que el cliente confirme |
| Confirmado | Sí | Lo normal al agendar desde el mostrador |
| Atendida | Sí | Vino y se atendió |
| No vino | **No** | Faltó sin avisar. Libera el horario |
| Cancelado | **No** | Se canceló. Libera el horario y guarda el motivo |

**Cada cambio de estado queda registrado** con autor, fecha y motivo. De ahí
sale el índice de ausentismo de cada cliente, que es lo que después decide
cuántos recordatorios necesita y por qué canal.

Marcar quién vino y quién no tiene que costar un toque: si cuesta más, nadie
lo hace y el dato no existe. Por eso las acciones están en la pantalla del
turno, no escondidas en un menú.

## Qué puede hacer cada rol

| Acción | owner | admin | reception | staff |
| --- | :-: | :-: | :-: | :-: |
| Ver la agenda | ✅ | ✅ | ✅ | ✅ |
| Agendar y reprogramar | ✅ | ✅ | ✅ | ✅ |
| Cambiar el estado | ✅ | ✅ | ✅ | ✅ |
| Bloquear la agenda | ✅ | ✅ | ✅ | ✅ |
| **Borrar** un turno | ✅ | ❌ | ❌ | ❌ |

Un turno **no se borra: se cancela**. Borrarlo dejaría la caja y los informes
sin explicación. La eliminación queda reservada al titular y para casos de
error grosero.

Un servicio con turnos tampoco se puede borrar: la clave foránea lo impide.
Para dejar de ofrecerlo está el interruptor de "activo".

## Agendar es una sola operación de base

`public.book_appointment()` escribe el turno y sus servicios **en una sola
transacción**, y calcula del lado de la base la duración, el bloqueo y el
precio.

Tiene que ser así: las verificaciones son triggers diferidos que corren al
cerrar la transacción, y dos llamadas desde la aplicación son dos
transacciones. La primera cerraría con un turno sin servicios y fallaría
siempre. Como efecto colateral bueno, la aplicación ya no puede escribir una
ventana incoherente aunque quiera.

La función es `SECURITY INVOKER`: corre con los permisos de quien llama, así
que la RLS sigue decidiendo en qué negocio se puede agendar y con qué
servicios.

## Zonas horarias

Toda la aritmética de "qué día es" pasa por `src/lib/tz.ts`.

Una agenda se rompe siempre por el mismo lado: el servidor calcula "hoy" en
UTC, el turno de las 21:30 de Río Cuarto cae en el día siguiente y aparece en
la pantalla equivocada. El día del negocio empieza y termina según su
`timezone`, nunca según UTC.

Hay pruebas para el turno de las 21:30 y para una zona con horario de verano.

## Bloqueos

Los ratos en que no se atiende: un feriado, el turno del médico, unas
vacaciones. Se ven en la agenda y los va a respetar la reserva online.

**No cancelan los turnos que ya estén puestos** en ese rato: si hay que
moverlos, se mueven a mano. Un bloqueo que borra turnos en silencio es peor
que no tener bloqueos.

## Cobrar desde el turno

La pantalla del turno tiene su tarjeta de cobro: el saldo se calcula solo y el
importe, el concepto y el cliente vienen cargados. Está documentada en
[Caja](caja.md#cobrar-desde-el-turno).

Un profesional no la ve, igual que no ve la caja.

## Cuando el cambio lo hace el cliente

Cada turno tiene un enlace propio desde el que el cliente puede confirmarlo,
moverlo o cancelarlo. El cambio aparece en la agenda en el momento, y el
historial lo atribuye a **el cliente**, no al equipo. Está documentado en
[El turno del cliente](autogestion.md).

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Esquema, triggers y `book_appointment` | `supabase/migrations/20260911150000_agenda.sql` |
| Zonas horarias | `src/lib/tz.ts` |
| Consultas | `src/lib/data/agenda.ts` |
| Escrituras | `src/lib/actions/agenda.ts` |
| Pantallas | `src/app/agenda/` |
| Pruebas | `tests/rls/agenda.test.ts`, `tests/unit/tz.test.ts` |

## Confirmado quiere decir que el cliente lo dijo

Un turno nace **sin confirmar**, lo cargue el equipo o lo saque el cliente por
internet. Reservar no es confirmar: quien sacó turno hace tres semanas no dijo
nada sobre mañana, y esa es justamente la pregunta que el equipo se hace al
mirar la agenda del día siguiente.

Pasa a confirmado de dos maneras, y las dos son una persona diciéndolo:

- alguien del equipo toca **Confirmar** en el turno, después de hablar;
- el cliente toca **Confirmar** en el recordatorio de WhatsApp, y la agenda se
  actualiza sola.

### Los colores

| Estado | Color | Por qué |
| --- | --- | --- |
| Sin confirmar | Gris | Todavía no pasó nada. No es una alerta |
| Confirmado | Verde | Dijo que viene |
| **Cambiado** | Ámbar | Ya movió este turno una vez: es el que más chances tiene de volver a moverse |
| No vino | Rojo | |
| Cancelado | Apagado | |

El ámbar quedó libre para «cambiado» justamente porque «sin confirmar» dejó de
ser una alerta.

## Lo que todavía no está

- **Vista de semana y de calendario**: hoy se ve un día por vez, con la tira
  semanal para saltar. La vista de líneas de tiempo llega si hace falta.
- **Varias profesionales**: el turno ya tiene `staff_id`, pero la interfaz no
  lo usa mientras haya una sola.
- **Arrastrar para mover un turno**: hay botón de mover —con fecha y hora— y
  el turno queda marcado como movido, pero no se arrastra en la grilla.

Los **horarios de atención** ya tienen su tabla (`business_hours`) y su
pantalla: los consume la reserva online para calcular huecos.
- **Señas online**: cobrar la seña desde el sistema, no sólo registrarla.
