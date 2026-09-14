# Servicios

## Qué es

El catálogo de lo que el negocio ofrece: cada depilación, limpieza de cutis,
masaje o tratamiento, con su duración, su precio y cuántas personas se pueden
atender a la vez.

## Para qué sirve

Es la base de casi todo lo demás:

| Quién lo usa | Para qué |
| --- | --- |
| Agenda | Cuánto ocupa el turno y cuántos caben en el mismo horario |
| Reserva online | Qué puede elegir el cliente y a qué precio |
| Caja | Cuánto se cobra |
| Informes | Qué servicios dejan más plata |
| Recordatorios | Filtrar reglas por tipo de servicio |

Sin servicios cargados no se pueden agendar turnos. Es el primer paso de una
negocio nuevo.

## Qué información usa

| Dato | Qué significa | Por qué importa |
| --- | --- | --- |
| Nombre | Cómo se llama | Único dentro del negocio. Dos servicios con el mismo nombre son siempre un error de carga |
| Categoría | Agrupación opcional | Para que un listado de treinta ítems siga siendo legible |
| Descripción | Qué incluye | Se muestra en la reserva online |
| Duración | Minutos que ocupa | Define el bloque en la agenda |
| Preparación y limpieza | Minutos bloqueados después | Ocupan agenda, **no se cobran** ni se le muestran al cliente |
| Turnos simultáneos | Cuántas personas a la vez | Ver abajo |
| Precio | En pesos, o "a convenir" | Se guarda en centavos y como entero |
| Activo | Si se ofrece hoy | Apagarlo lo saca de la agenda sin tocar los turnos existentes |
| Reservable online | Si el cliente lo puede elegir por su cuenta | Separado de "activo" a propósito |

### Turnos simultáneos

Es la diferencia más grande con el sistema anterior. Asusalud superpone turnos
a mano porque el aparato de depilación trabaja solo mientras ellas atienden a
otra persona. Acá eso es un número: si el servicio admite tres a la vez, la
agenda lo sabe y deja de ser un truco manual.

Un masaje es siempre 1: nadie puede masajear a dos personas al mismo tiempo.

### Precio

Se guarda en **centavos y como entero**. Con decimales de punto flotante,
sumar mil turnos termina dando un total que no cierra con la caja.

Un precio vacío y un precio "a convenir" **no son lo mismo**. El primero es un
dato faltante; el segundo, una decisión. Confundirlos es lo que rompe los
informes, y es lo que pasa hoy en TuTurno con cuatro servicios sin precio.

### Historial de precios

Cada cambio de precio queda registrado con fecha y autor. Con la inflación
argentina los precios se actualizan seguido, y sin historial un turno de hace
tres meses se valuaría al precio de hoy: el informe mentiría.

Lo escribe un trigger, no la aplicación. Sólo lo ven owner y admin: es
información comercial.

## Qué puede hacer cada rol

| Acción | owner | admin | reception | staff |
| --- | :-: | :-: | :-: | :-: |
| Ver el catálogo | ✅ | ✅ | ✅ | ✅ |
| Crear y editar | ✅ | ✅ | ❌ | ❌ |
| Ver el historial de precios | ✅ | ✅ | ❌ | ❌ |

Todo el equipo necesita ver precios y duraciones para poder agendar.
Modificarlos es cosa de quien manda.

## Consecuencias de cada acción

| Acción | Qué pasa |
| --- | --- |
| Cambiar el precio | Los turnos **futuros** toman el precio nuevo. Los ya cobrados no se tocan. Queda una fila en el historial |
| Cambiar la duración | Los turnos ya agendados **mantienen** la duración que tenían |
| Apagar "activo" | Deja de aparecer al agendar. Los turnos existentes siguen en pie |
| Apagar "reservable online" | El cliente deja de verlo, pero el negocio lo puede seguir agendando |
| Borrar un servicio | **No se ofrece desde la interfaz.** Se desactiva, porque los turnos históricos lo referencian |
| Borrar una categoría | Los servicios quedan sin categoría. No se borra ninguno |

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Esquema, RLS y triggers | `supabase/migrations/20260911130000_services.sql` |
| Consultas | `src/lib/data/services.ts` |
| Escrituras | `src/lib/actions/services.ts` |
| Formato de plata y duración | `src/lib/money.ts` |
| Pantallas | `src/app/servicios/` |
| Pruebas | `tests/rls/services.test.ts` |

## Cómo prepararse

Cada servicio puede decir qué tiene que saber el cliente antes de venir: qué
traer, cómo prepararse, qué no hacer. Ese texto viaja dentro del recordatorio
por el hueco `{{preparacion}}`, así **una sola plantilla sirve para todos los
servicios** y no hay que aprobar una en Meta por cada uno.

Se escribe como se lo dirías al cliente, porque lo va a leer tal cual.

## Lo que todavía no está

- Actualización masiva de precios (subir todo un 15% de una vez). Con
  inflación es una necesidad real, pero puede esperar a que haya volumen.
- Asignar qué profesional hace cada servicio: llega cuando haya más de una.
- Insumos que consume cada servicio: llega con el módulo de stock.
