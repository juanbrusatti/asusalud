# Caja

## Qué es

Lo que entra y lo que sale, día por día. Al cerrar, la estética sabe si lo que
hay en el cajón es lo que debería haber.

Es lo que hoy Asusalud **no tiene**: TuTurno lo deja detrás del plan Empresa,
así que llevan la plata en un cuaderno.

## Tres decisiones que definen todo

### 1. Los movimientos no se editan ni se borran

Un error se corrige **anulándolo**: se crea el movimiento contrario y quedan
los dos. El total da cero y se ve que hubo una corrección, no que algo
desapareció.

Una caja que se puede editar hacia atrás no sirve para cerrar el día, porque
nunca se sabe si lo que dice hoy es lo que decía ayer.

No alcanza con no poner el botón: la tabla **no tiene permiso de UPDATE ni
DELETE para nadie**, y además un trigger lo rechaza. Si la tabla lo admitiera,
tarde o temprano alguien escribe el UPDATE.

> Única excepción: dar de baja una estética entera. El borrado en cascada de su
> caja es esperado, y sin esa excepción una estética con un solo cobro
> registrado no se podría eliminar nunca.

### 2. El arqueo cuenta sólo el efectivo

Una transferencia es un ingreso real, pero **no está en el cajón**. Mezclarlas
hace que el cierre nunca dé y que se deje de confiar en el número.

La pantalla muestra el total por medio de pago, y aclara que al cerrar sólo se
cuenta el efectivo.

### 3. Una sola caja abierta por sucursal

Dos sesiones abiertas a la vez significan que nadie sabe dónde cae cada cobro.
Lo garantiza un índice único, no una validación en la pantalla.

## El cierre

Se cuenta el efectivo y se pone el total. **Recién después** se muestra cuánto
debería haber y cuál es la diferencia.

El orden importa: si el número esperado está a la vista antes de contar, el
conteo deja de ser un conteo.

Si no cuadra, se explica qué suele significar:

| Diferencia | Qué suele ser |
| --- | --- |
| Falta plata | Un cobro que no se registró, o un vuelto de más |
| Sobra plata | Un cobro registrado de menos |

El arqueo **queda guardado** —esperado, contado y diferencia— así que se puede
mirar el mes hacia atrás y ver si la caja cuadra siempre, nunca, o sólo los
sábados. Sin guardarlo, el número se calculaba al vuelo y se perdía.

Una caja cerrada no se reabre ni admite movimientos nuevos: el cierre quedaría
mintiendo. Para seguir cobrando se abre otra.

## Qué puede hacer cada rol

| Acción | owner | admin | reception | staff |
| --- | :-: | :-: | :-: | :-: |
| Ver la caja | ✅ | ✅ | ✅ | ❌ |
| Abrir, cobrar y cerrar | ✅ | ✅ | ✅ | ❌ |
| Anular un movimiento | ✅ | ✅ | ✅ | ❌ |

Quien atiende el mostrador cobra, así que recepción tiene acceso completo. Una
profesional **no ve la plata de la estética**.

## Lo que no pasa por el cajón

Un cobro por transferencia, débito o Mercado Pago se registra igual pero puede
no tener caja asociada: queda en la bitácora y en los totales por medio de
pago, fuera del arqueo.

El efectivo sí exige una caja abierta: si no, no habría dónde contarlo al
cerrar el día.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Esquema, inmutabilidad y arqueo | `supabase/migrations/20260912210000_caja.sql` |
| Total esperado accesible desde la app | `supabase/migrations/20260912220000_caja_totales.sql` |
| El arqueo guardado | `supabase/migrations/20260912230000_caja_arqueo.sql` |
| Tipos y etiquetas | `src/lib/caja.ts` |
| Consultas | `src/lib/data/caja.ts` |
| Abrir, cobrar, anular y cerrar | `src/lib/actions/caja.ts` |
| Pantallas | `src/app/caja/` |
| Pruebas | `tests/rls/caja.test.ts` |

## Lo que todavía no está

- **Cobrar desde el turno**: hoy el cobro se carga a mano en la caja. Falta el
  botón en la pantalla del turno, con el precio y el saldo ya cargados. La
  función `appointment_paid_cents()` ya existe para eso.
- **Señas online** con Mercado Pago.
- **Informes**: cuánto entró en el mes, por servicio, por medio de pago.
- **Facturación**: TuTurno emite facturas de AFIP. Es otro trámite y otra
  integración.
- **Varias sucursales**: la caja asume la principal.
