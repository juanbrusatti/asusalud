# Clientes

## Qué es

La ficha de cada persona que atiende el negocio: cómo contactarla, qué hay que
tener en cuenta antes de tocarla, y el seguimiento de sus sesiones.

## Para qué sirve

| Quién lo usa | Para qué |
| --- | --- |
| Agenda | A quién pertenece cada turno |
| Recordatorios | A qué número o correo se le avisa, y por cuál de los dos |
| Caja | A quién se le cobró |
| Campañas | A quién le llega cada promoción, usando las etiquetas |

## Las tres decisiones que explican el diseño

### 1. El teléfono se guarda dos veces

Se guarda **normalizado** (`+5493584123456`) y **tal como lo escribieron**
(`0358 15 412-3456`). Lo primero sirve para enviar; lo segundo evita que nadie
sienta que el sistema le arruinó el dato.

El detalle que rompe todo si se ignora: **WhatsApp exige el 9** en los celulares
argentinos. `+543584123456` es un fijo y el mensaje no llega; `+5493584123456`
es el mismo número como celular y sí llega.

Quien escribe con el 15 ya dijo que es celular y la normalización resuelve
sola. Un número pelado como `3584123456` es ambiguo, así que **se asume celular
y se avisa en pantalla**, con un interruptor para marcarlo como fijo. Guardar un
número que no va a recibir nada sería peor que preguntar.

Si el número no se puede interpretar, **la ficha se guarda igual** con el texto
crudo y queda marcada. Perder a la persona por un teléfono mal escrito no tiene
sentido.

### 2. El teléfono NO es único

En un negocio la madre saca turno para la hija con su propio número. Una
restricción dura haría fallar la importación de datos reales.

Los repetidos **se muestran, no se prohíben**: la ficha avisa "otra ficha usa
este número". Y a la hora de enviar, la regla de un mensaje por persona por día
evita el doble aviso.

### 3. El historial viejo se guarda aparte

Los campos `legacy_*` traen del sistema anterior cuántos turnos hizo, cuánto
gastó y cuándo vino por última vez. Están separados de lo que calculemos
nosotros para que **nunca se confundan un dato importado y uno propio**.

Es lo que permite conservar el perfil de valor y antigüedad de cada persona sin
migrar veinte mil turnos viejos.

## Qué información usa

| Dato | Notas |
| --- | --- |
| Nombre | Lo único obligatorio |
| Apellido, documento, cumpleaños | Opcionales |
| Teléfono | Normalizado + crudo. Ver arriba |
| Correo | Validado por formato. Es el canal gratuito |
| Aviso importante | Alergias, embarazo, medicación. Se muestra siempre arriba de todo |
| Por dónde le avisamos | `auto`, `email`, `whatsapp` o `none` |
| Etiquetas | Agrupación libre para segmentar después |
| Notas | Se suman en el tiempo, no se editan |

### Aviso importante vs. notas

No son lo mismo y la interfaz lo marca. El **aviso** es lo que no se puede pasar
por alto y aparece siempre, en color. Las **notas** son el seguimiento sesión a
sesión.

### Por dónde le avisamos

`auto` deja decidir a la cascada de canales: push, después correo (gratis) y
sólo al final WhatsApp (con costo). Las otras tres son decisiones humanas que el
sistema respeta y no pisa.

Quién la tomó y cuándo queda registrado. Volver a `auto` borra ese rastro.

La idea es que **nadie se siente a clasificar seis mil fichas**: el selector
aparece mientras se trabaja con la persona, se resuelve en un toque, y en dos
meses toda la clientela activa queda clasificada.

## Qué puede hacer cada rol

| Acción | owner | admin | reception | staff |
| --- | :-: | :-: | :-: | :-: |
| Ver fichas | ✅ | ✅ | ✅ | ✅ |
| Crear y editar | ✅ | ✅ | ✅ | ✅ |
| Escribir notas | ✅ | ✅ | ✅ | ✅ |
| Crear etiquetas | ✅ | ✅ | ✅ | ✅ |
| Borrar fichas, notas o etiquetas | ✅ | ✅ | ❌ | ❌ |

A diferencia del catálogo de servicios, acá **escriben los cuatro roles**:
recepción agenda y los profesionales anotan cómo fue la sesión. Lo que se
restringe es borrar.

Las notas **no se pueden editar por nadie**: no hay permiso de UPDATE sobre la
tabla. Son el registro de lo que pasó; se corrigen agregando otra.

## El importador

En **Clientes → Importar**. Tres pasos y nada se guarda hasta el último.

1. **Archivo.** Excel (`.xlsx`) o CSV. Se lee **en el navegador**: los datos no
   viajan al servidor hasta que las columnas están mapeadas.
2. **Mapeo.** Detecta sola qué columna es qué comparando encabezados contra una
   lista de alias, por **palabras completas**. La coincidencia por subcadena
   daba errores absurdos: "id" aparece dentro de "cantidad", y "Cantidad de
   turnos" terminaba mapeada a Documento.
3. **Confirmación.** Se manda en lotes de 500 para no pasar el límite de tamaño
   de una Server Action y para poder mostrar el avance.

### Duplicados

Se buscan por teléfono y por correo, tanto contra lo que ya hay en la base como
dentro del propio archivo. Por defecto **se saltean**; un interruptor permite
actualizar las fichas existentes en vez de ignorarlas.

### Filas con problemas

Nunca frenan la importación. Al final se listan con el número de fila del
archivo y el motivo, para corregirlas después. Una fila sin nombre se descarta;
una con teléfono ilegible **se carga igual** con el texto crudo.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Esquema, RLS y triggers | `supabase/migrations/20260911140000_clients.sql` |
| Normalización de teléfonos | `src/lib/phone.ts` |
| Consultas | `src/lib/data/clients.ts` |
| Escrituras | `src/lib/actions/clients.ts` |
| Importación | `src/lib/import/columns.ts`, `src/lib/actions/import.ts` |
| Pantallas | `src/app/clientes/` |
| Pruebas | `tests/rls/clients.test.ts` |

## Lo que todavía no está

- Último turno, próximo turno y total facturado **propios**: llegan con la
  agenda. Por ahora sólo se ve lo importado.
- Fusionar dos fichas duplicadas en una.
- Exportar la lista.
- `client_channels` con estado de entrega y aperturas: llega en la fase 2, con
  el motor de envíos.
