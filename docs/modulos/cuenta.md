# La cuenta: lo que Dlay le cobra al negocio

## Qué es

Dlay se cobra **por turno que ocurrió**. Si el negocio atendió, se cobra; si
no, no. Eso ata lo que paga a lo que gana, y hace que un mes flojo salga
barato.

Dos pantallas: *Ajustes → Tu cuenta*, que ve el negocio, y `/plataforma`, que
ve Dlay y muestra todos los negocios a la vez.

## Las decisiones que explican el resto

### No hay un contador que se suma y se resta

Lo que se debe **se calcula sobre los turnos cada vez que alguien pregunta**.
Un número guardado que se toca a mano no se puede auditar: el día que quede
mal, nadie va a saber cuándo se desvió.

Lo único que se guarda es el pago, y al guardarlo congela cuántos turnos
fueron, sobre cuánto facturado, con qué forma de cobro y a qué porcentaje. Por
eso cambiar el precio no reescribe el pasado.

### No se cobra por `attended`

El estado existe en el enum pero **no lo escribe nadie**: los turnos quedan en
`pending` o `confirmed` para siempre. Facturar por ahí habría dado cero todos
los meses sin que nada avisara.

Se cobra por **turno que ya ocurrió y no se canceló**. Eso no lo aprieta
nadie: lo decide el reloj. Y si fuera un botón, sería un botón que cuesta
plata — la mejor forma de que la gente deje de apretarlo.

Los cancelados y los ausentes no se cobran.

### El importe de un mes se decide en un solo lugar

`app.importe_mes` es la única función que lo sabe. De ahí leen la pantalla del
negocio, el panel, el cobro, el aviso automático y el recordatorio manual. Con
la cuenta repartida en cinco lugares, la pantalla y la factura terminan
diciendo números distintos y nadie se entera hasta que alguien reclama. Hay
una prueba que compara el recordatorio con la cuenta y exige el mismo número.

## Las tres formas de cobro

De la más general a la más puntual. La de abajo siempre gana:

| Forma | Dónde vive | Para qué |
|---|---|---|
| Porcentaje de lo facturado | `billing_settings.commission_bps` | Para quien prefiera pagar en proporción a lo que factura. Ya no es el de fábrica. |
| Abono fijo por mes | `billing_settings.fixed_cents` | **El de fábrica: $10.000.** Todo negocio nuevo nace así (trigger `tenants_cobro_de_fabrica`). |
| Importe de un mes puesto a mano | `billing_amounts` | Para apartarse de lo pactado sin cambiar el acuerdo. |

El porcentaje se guarda en **puntos básicos y entero** —3% es 300— por la
misma razón por la que la plata se guarda en centavos: con coma flotante,
sumar mil turnos deja un total que no cierra con ningún papel.

Y se aplica **al total del mes, no turno por turno**. Redondear cada turno y
sumar después no da lo mismo que sumar y redondear una vez, y la segunda forma
es la que se explica en una línea.

## Cobrar

1. Cuando cierra el mes, `app.avisar_cuentas` —todos los días a las 9— le
   manda una notificación al negocio. Se busca durante la primera semana y
   queda marcada con una etiqueta, así sale aunque el reloj falle un día y
   nunca sale dos veces.
2. El negocio entra a *Tu cuenta*, toca **Pagar** y aparecen el QR y el botón.
   Los dos son la misma dirección de Mercado Pago: el QR sirve cuando está en
   la computadora, el botón cuando ya está en el teléfono.
3. El cobro se guarda con su importe. Si el importe cambia después, ese enlace
   deja de servir y se pide uno nuevo — si no, la pantalla diría $40.000 y el
   QR cobraría $240.
4. Cuando el pago entra, Mercado Pago avisa al webhook. **Al aviso no se le
   cree**: se le pregunta a Mercado Pago por ese pago con nuestra propia clave.
   Eso es lo que hace que no haga falta verificar la firma — para que marquemos
   un mes como pagado tiene que haber un pago aprobado de verdad en nuestra
   cuenta, y eso se consigue pagando.
5. Se registra **lo que entró**, no lo que se esperaba. Si no coinciden, la
   diferencia queda anotada en el pago. Dar por cobrado un importe que nadie
   pagó es peor que no cobrarlo: no queda rastro de que falta plata.

Desde el panel también se puede marcar a mano, deshacer un pago mal marcado y
**recordar** — que levanta un cartel en el sistema del negocio y, si tiene
notificaciones, le manda una al teléfono.

## Lo que todavía no está

- **Un piso mensual.** El costo de Dlay no baja a cero cuando un cliente no
  trabaja: un negocio dormido cuesta plata igual.
- **Cobrar un mes sin turnos.** Un mes sólo aparece si tuvo al menos un turno.
  Con porcentaje es correcto; con abono fijo es discutible.
- **Factura.** El cobro por Mercado Pago no reemplaza emitirla.
- **Los servicios «a convenir»** no tienen precio, así que no suman a lo
  facturado. La pantalla lo aclara.


## El precio desde octubre de 2026

Una cuenta nueva tiene **30 días gratis** desde que se crea. Después paga
**$10.000 cada 30 días, por adelantado**, más lo que Meta cobre por cada
mensaje de WhatsApp (hoy $37,68; también durante la prueba), que sale contra
la tarjeta del negocio y no pasa por Dlay.

Cuando vence hay **5 días para pagar**. Pasados, la cuenta se suspende sola
(`app.aplicar_suspensiones`, cada hora): `tenants.status` pasa a
`suspended`, que el planificador, la reserva online y la autogestión ya
respetan, y se saltean los avisos en cola. No se borra nada. Al pagar
—Mercado Pago con referencia `sus:<negocio>:<ciclo>`, o a mano desde el
panel— se reactiva en el acto. Pagar en la gracia no regala días: el ciclo
nuevo arranca donde terminaba el viejo. Pagar suspendida arranca hoy: no se
cobran los días sin servicio.

Hay dos carriles (`billing_settings.plan`): `suscripcion`, el de toda cuenta
nueva, y `acuerdo`, el de las que existían antes, que se siguen cobrando por
mes vencido y nunca se suspenden solas.

El número vive en dos lugares y en ninguno más: `src/lib/precio.ts` para lo
que se muestra y `billing_settings.fixed_cents` para lo que se cobra.

Los negocios creados antes conservan lo que tienen configurado en el panel.
Las funciones viejas todavía dicen 3% como valor de respaldo; no se usa
porque todo negocio nace con su fila de cobro.
