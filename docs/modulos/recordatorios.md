# Recordatorios

## Qué es

El motor que avisa solo. Una regla es una frase completa:

> **CUANDO** falten 24 horas para el turno
> **PARA** los turnos confirmados de depilación
> **ENVIAR** este mensaje
> **POR** notificación, si no correo, si no WhatsApp
> **DENTRO** de la franja de 9 a 21

Se arma una vez y no se toca más.

## Las dos ideas que sostienen todo

### 1. El canal se elige, no se asume

Cada regla lleva un **orden de preferencia** y el sistema baja por él hasta
encontrar uno que esa persona tenga.

| Canal | Costo |
| --- | --- |
| Notificación de la app | $0 |
| Correo | $0 |
| WhatsApp | **$37,68** por mensaje |

La diferencia no es teórica. Con los mismos cuatro destinatarios de la prueba:

| Orden de canales | Costo |
| --- | --- |
| Correo → WhatsApp | **$75** |
| Sólo WhatsApp | **$151** |

Exactamente el doble. Por eso el orden es lo primero que se configura, y por
eso el simulador muestra el número antes de activar nada.

### 2. Nada se envía dos veces

Cada envío planificado lleva una **clave de deduplicación** única por negocio.
El planificador puede correr de más, solaparse o reintentarse: la fila ya
existe y no se duplica.

El bug de "me llegaron cuatro recordatorios" no puede ocurrir: lo impide un
índice único, no un `if`.

## El recorrido de un recordatorio

```
pg_cron cada 5 min          app.plan_reminders()
   │                         · recorre las reglas activas
   │                         · busca los turnos que entran
   │                         · resuelve el canal de cada persona
   ▼                         · calcula el costo
message_jobs (la cola)      · inserta con clave única
   │
   │  pg_cron cada 1 min     app.claim_due_jobs()   ← llega con el emisor
   ▼                         · toma los vencidos con SKIP LOCKED
 emisor                      · verifica los topes por persona
                             · respeta el freno general
```

El planificador mira **72 horas hacia adelante**. Un envío que vence dentro de
tres días ya está en la cola mucho antes de que llegue su hora.

## El reloj vive en Postgres

Esta es la decisión que hace que el producto entre en los planes gratuitos.

El plan Hobby de Vercel permite **un cron por día**: cualquier expresión más
frecuente falla al desplegar. Un motor de recordatorios necesita revisar la
cola cada pocos minutos. Así que el reloj es `pg_cron`, que en el plan gratuito
de Supabase admite cadencia de un minuto.

Beneficio extra: los recordatorios se siguen planificando aunque un deploy de
la web falle.

## Qué configura una regla

| Campo | Qué hace |
| --- | --- |
| Disparador | Antes del turno, después, cumpleaños, o sin actividad |
| Cuánto | Minutos con signo. **Sin tope**: quince días antes es válido |
| Orden de canales | Se prueba en orden y gana el primero disponible |
| Servicios | Vacío significa todos |
| Sólo a quien faltó | La palanca que más ahorra |
| Franja horaria | Lo que vence de madrugada espera a la mañana |

### El desfase no tiene tope

Es la limitación concreta del sistema anterior que este resuelve: **TuTurno no
permite recordar con más de una semana de anticipación**. Acá un solo entero
con signo cubre todos los casos, y hay una prueba que verifica que un
recordatorio de siete días antes efectivamente se planifica.

### "Sólo a quien alguna vez faltó"

Un cliente con cien turnos y cero faltas no necesita tres avisos. La regla
mira el historial de estados de sus turnos y la deja afuera. Es la palanca de
ahorro más grande después de la cascada de canales.

## Las salvaguardas

Ninguna regla individual las puede saltear. Viven en la configuración de la
negocio y se aplican en el despachador, no al planificar, porque dependen de
lo que **realmente salió**.

| Salvaguarda | Por defecto |
| --- | --- |
| Franja horaria | 9 a 21 |
| Máximo por persona por día | 2 |
| Máximo por persona por semana | 5 |
| Presupuesto mensual | Sin tope |
| Freno general | Encendido |

### El freno general

Para todo en un toque, sin apagar reglas de a una.

Mientras está frenado **tampoco se planifica**. Si la cola siguiera
llenándose, al soltar el freno saldría todo junto de golpe, que es exactamente
lo que provoca un bloqueo.

### Bajas

La lista de bajas se consulta antes de cada envío, y se puede dar de baja un
canal puntual o todos. Cualquiera del equipo puede darla: si un cliente pide
que no le escriban más, quien la atiende tiene que poder resolverlo en el
momento. Una baja ignorada no es un error de producto, es una denuncia.

### Turnos que cambian

Si un turno se cancela, se marca como ausencia o se mueve de horario, **los
envíos pendientes de ese turno se cancelan solos**. Un recordatorio de un turno
que ya no existe es el peor mensaje posible.

## Los mensajes

Cada canal necesita el suyo: lo que sirve en un correo no sirve en un WhatsApp.
El texto admite huecos que se completan al enviar: `{{cliente}}`, `{{fecha}}`,
`{{hora}}`, `{{servicio}}`, `{{estetica}}` y `{{link}}`. El editor muestra la
vista previa con datos de ejemplo.

`{{link}}` es el enlace del turno: desde ahí el cliente lo confirma, lo mueve o
avisa que no viene sin escribirle a nadie. Es el hueco que convierte un
recordatorio en algo que ahorra trabajo en lugar de generarlo — ver
[El turno del cliente](autogestion.md). Un aviso que no cuelga de un turno,
como un cumpleaños, lo deja vacío en vez de mostrar el hueco.

Los de WhatsApp llevan además el **nombre exacto con el que Meta los aprobó**.
Sin eso, Meta rechaza el envío, así que la base lo exige.

## Qué puede hacer cada rol

| Acción | owner | admin | reception | staff |
| --- | :-: | :-: | :-: | :-: |
| Ver reglas, cola y gasto | ✅ | ✅ | ✅ | ✅ |
| Crear y activar reglas | ✅ | ✅ | ❌ | ❌ |
| Escribir mensajes | ✅ | ✅ | ❌ | ❌ |
| Dar de baja a un cliente | ✅ | ✅ | ✅ | ✅ |

Quién le escribe a la clientela y cuánto se gasta es una decisión de negocio.
Dar de baja a alguien, no.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Esquema, resolutor y planificador | `supabase/migrations/20260911160000_reminders.sql` |
| El reloj | `supabase/migrations/20260911170000_scheduler.sql` |
| Simulador de costo | `supabase/migrations/20260911180000_simulate.sql` |
| Tipos y etiquetas compartidos | `src/lib/recordatorios.ts` |
| Consultas | `src/lib/data/recordatorios.ts` |
| Escrituras | `src/lib/actions/recordatorios.ts` |
| Pantallas | `src/app/recordatorios/` |
| Pruebas | `tests/rls/reminders.test.ts` |

> `src/lib/recordatorios.ts` existe separado a propósito: el constructor de
> reglas es un componente de cliente y necesita esas constantes. Si las
> importara del módulo de consultas arrastraría `next/headers` al navegador y
> el build falla.

## Los tres botones del recordatorio

Cada recordatorio de WhatsApp lleva los tres botones que permite Meta, y los
tres hacen algo de verdad:

| Botón | Qué pasa |
| --- | --- |
| **Confirmar** | El turno pasa a confirmado en la agenda y se le contesta «¡Gracias! Te esperamos» |
| **Cancelar** | El turno se cancela, el horario queda libre, y queda escrito que lo canceló el cliente |
| **Cambiar horario** | Se le contesta con el enlace de su turno, donde elige otro horario solo |

Contestar no cuesta nada: apretar un botón abre una ventana de veinticuatro
horas, y dentro de esa ventana el mensaje es de servicio.

El acuse importa más de lo que parece. Sin él, el cliente aprieta «Confirmar»,
no ve que pase nada de su lado, y vuelve a apretar o escribe preguntando si
llegó — que es justo el mensaje que el recordatorio venía a evitar.

## Lo que todavía no está

- **El emisor.** La cola se llena y se puede mirar, pero nadie entrega los
  mensajes todavía. Falta el canal de WhatsApp (bloqueado por la verificación
  de empresa ante Meta), el correo por Brevo y las push de la PWA.
- **El despachador no está agendado** por lo mismo: sacar filas de la cola sin
  emisor sólo las marcaría como enviadas sin que nadie reciba nada.
- **Webhooks de estado**: entregado, leído, fallido. Llegan con el canal de
  WhatsApp.
- **Corte automático por calidad**: cuando haya métricas reales de entrega.
- **Presupuesto mensual**: el campo existe, falta que el despachador lo mire.
