# Informes

## Qué es

Cómo viene el negocio en un período: lo que entró, cómo respondió la agenda,
qué servicios dejan más, si los recordatorios sirven y cuánto costó avisar.

Todo sale de datos que ya se cargan trabajando. No hay nada que completar
aparte: si la agenda está al día y los cobros se registran, el informe existe.

## Dos números que parecen el mismo y no lo son

Es la distinción que ordena toda la pantalla, y está escrita en ella:

| | De dónde sale | Qué contesta |
| --- | --- | --- |
| **Lo cobrado** | Movimientos de caja | Cuánta plata entró de verdad |
| **Lo facturado** | Precio de los turnos atendidos | Cuánto trabajo se hizo |

Si lo facturado es bastante mayor que lo cobrado, **o falta cargar cobros o hay
clientes debiendo**. Las dos cosas conviene saberlas, y por eso los números van
separados en vez de mezclados en un solo total que no significaría ninguna de
las dos.

## Qué muestra

### Lo que entró por la caja

Cobrado, gastos y lo que queda, más el desglose por medio de pago. Las
anulaciones ya vienen descontadas: un cobro mal cargado y después anulado no
aparece ni de un lado ni del otro.

### Cómo respondió la agenda

Turnos, atendidos, ausencias y cancelados.

- **El ausentismo se mide sobre turnos ya cumplidos** (atendidos + ausencias).
  Los cancelados no cuentan: avisar que no venís no es faltar, y meterlos
  adentro haría parecer desastrosa una agenda que funciona.
- **La ocupación** compara los minutos agendados con los minutos de atención
  según los horarios de Ajustes. Sin ese denominador, "210 minutos agendados"
  no dice si fue un día lleno o uno muerto.
- Si quedan turnos del período sin marcar como atendidos o ausentes, lo avisa:
  hasta que se marquen no entran en ninguno de los dos números.

### Qué servicios dejan más

Ordenados por lo facturado, con la cantidad de turnos y el tiempo de sillón que
consumieron. Un servicio que factura mucho ocupando poco tiempo no es lo mismo
que uno que factura igual ocupando el triple.

Sólo cuenta turnos **atendidos**: un turno al que el cliente no vino no facturó
nada, aunque tuviera precio.

### ¿Sirven los recordatorios?

Compara el ausentismo de los turnos que recibieron aviso contra el de los que
no. Es la única forma honesta de saber si el sistema sirve.

**No muestra la comparación hasta tener al menos cinco turnos de cada lado.**
Sacar un porcentaje de dos o tres turnos da una cifra que suena precisa y no
significa nada; mostrarla sería peor que no mostrar nada.

### Cuánto costó avisar

Mensajes enviados y lo que costaron, por canal. Es el número que ordena todo el
sistema de recordatorios: **el objetivo es que tienda a cero**. Va en el informe
justamente para que se vea si eso se cumple.

Los envíos de prueba no cuentan: no salieron, así que no son ni avisos ni
gastos.

## Los períodos

Cuatro atajos —este mes, mes pasado, últimos 30 días, este año— más un rango
libre.

Los atajos son **enlaces** y el rango libre es un **formulario GET**: sin una
línea de JavaScript, la pantalla se puede compartir por su dirección y el botón
de atrás del navegador hace lo que se espera.

Las fechas son días **del negocio**, no del servidor. En Vercel el proceso
corre en UTC: a las 21:30 de Río Cuarto allá ya es mañana, y "este mes"
saltaría un día antes de tiempo. Un cobro de las 22:30 del lunes pertenece al
lunes.

La base rechaza un período que termina antes de empezar y uno de más de un año
—ese último sería un informe que nadie pidió y una consulta que barre la tabla
entera—. La pantalla endereza sola un rango escrito al revés antes de llegar
ahí.

## Una sola consulta

`report_period(desde, hasta)` contesta las seis preguntas y devuelve un `jsonb`.

Son seis preguntas sobre las mismas fechas: hacerlas por separado serían seis
viajes a la base que además **podrían no coincidir entre sí** si alguien cobra
justo en el medio.

Es `security invoker`, así que la RLS decide qué ve cada quien sin ninguna
comprobación extra: un profesional recibe los totales de plata en cero, no un
error, porque la política de la caja la deja afuera de esas filas.

## Quién lo ve

| Rol | Ve los informes |
| --- | :-: |
| owner | ✅ |
| admin | ✅ |
| reception | ❌ |
| staff | ❌ |

Recepción ve la caja del día, que es lo que necesita para trabajar. El informe
es la foto del negocio entero: lo ve quien lo maneja.

El enlace tampoco aparece en la barra para quien no puede entrar. Que un enlace
lleve a un "no encontrado" es una forma barata de hacer sentir a alguien que
algo está roto.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| La consulta | `supabase/migrations/20260912240000_informes.sql` |
| Tipos, períodos y textos | `src/lib/informes.ts` |
| Lectura | `src/lib/data/informes.ts` |
| Pantalla | `src/app/informes/` |
| Pruebas de la consulta | `tests/rls/informes.test.ts` |
| Pruebas de los períodos | `tests/unit/informes.test.ts` |

## Lo que todavía no está

- **Comparar con el período anterior**: "$ 230.000 este mes" dice poco sin
  saber si el mes pasado fueron $ 180.000 o $ 320.000.
- **Evolución en el tiempo**: hoy cada informe es una foto. Una línea de los
  últimos doce meses mostraría la temporada alta y la baja.
- **Clientes**: cuántas nuevas, cuántas volvieron, cuáles hace meses que no
  vienen. Es la base para las campañas segmentadas de la fase 4.
- **Por profesional**: cuando la agenda se reparta por persona.
- **Exportar a Excel**, para la contadora.
