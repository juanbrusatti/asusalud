# Conectar WhatsApp

## Qué es

La pantalla donde un negocio conecta su número de WhatsApp para que los
recordatorios puedan salir por ahí. Vive en **Ajustes → WhatsApp**.

Es el último paso del alta y el único que depende de un trámite con Meta.

## El problema que hay que resolver

El sistema se piensa para muchos negocios, no para uno. Si conectar WhatsApp
exige que alguien de Dlay se siente al lado de cada persona, el producto no
escala: con cien clientes hacen falta cien acompañamientos.

Meta tiene la respuesta, y se llama **Embedded Signup**: el dueño hace clic en
un botón dentro de Dlay, se abre una ventana de Facebook, elige o crea su
cuenta de WhatsApp, pone su número, lo verifica y listo. Nadie abre la consola
de desarrolladores. Dlay recibe el identificador de la cuenta, el del número y
un código que se cambia por un token, servidor contra servidor.

Averiguado en la documentación de Meta el 14/09/2026:

- **Registrarse como Tech Provider es obligatorio** para quien ofrece WhatsApp
  dentro de su software, y el Embedded Signup es el camino por defecto para dar
  de alta negocios nuevos.
- El negocio **no necesita verificar su empresa para empezar**: sin verificar
  puede iniciar **250 conversaciones por día**, que para un negocio de veinte
  turnos diarios sobra. La verificación sólo hace falta para pasar de ahí.
- Sí tiene que **cargar una tarjeta**. Ese paso no se puede automatizar.
- **La versión 2 del Embedded Signup se deprecia el 8 de octubre de 2026**, así
  que cualquier integración nueva va directo sobre la v4.

## Lo que Dlay tiene que hacer una sola vez

Antes de poder ofrecer el botón:

1. Un portfolio de Meta Business a nombre de Dlay.
2. **Verificación de la empresa** ante Meta, con documentación.
3. Una aplicación con el caso de uso de WhatsApp.
4. **App Review** con acceso avanzado a `whatsapp_business_management` y
   `whatsapp_business_messaging`, incluyendo videos que muestren un mensaje
   enviado y una plantilla creada desde el sistema.

Ese punto 4 tiene un huevo y una gallina: para grabar los videos, el sistema ya
tiene que estar mandando mensajes y creando plantillas con una cuenta real. Por
eso el camino manual no es sólo un parche de transición: es el que permite
llegar al automático.

## Las dos puertas

La columna `onboarding` distingue cómo se conectó cada cuenta:

| | `manual` | `embedded` |
| --- | --- | --- |
| Quién carga las credenciales | La persona, a mano | El intercambio con Meta |
| `app_secret` | El de la aplicación de ese negocio | El de la aplicación de Dlay |
| Webhook | Uno por negocio | **Uno solo para todos** |
| Cuánto tarda | Una tarde, con suerte | Cinco minutos |

## Lo que ve quien conecta

Antes de los pasos, tres avisos que conviene dar **antes** y no después:

- **Un número nuevo, sólo para esto.** El número que se conecta deja de
  funcionar en la aplicación de WhatsApp del teléfono. Quien conecta el número
  con el que viene hablando con sus clientes pierde esa conversación.
- **Una tarjeta.** Meta cobra por mensaje. El sistema manda primero por
  notificación y por correo, que son gratis, pero Meta igual exige la tarjeta.
- **No hace falta verificar la empresa para arrancar.** Es la duda que más
  frena, y la respuesta es que no.

Después, los cinco pasos del lado de Meta, numerados, con el más técnico
señalado como tal en lugar de disimulado.

## El token entra y no sale

`whatsapp_accounts` **no tiene ningún permiso para quien navega**, ni siquiera
de lectura. Se escribe con `whatsapp_connect()`, que es `security definer` y
comprueba el rol por su cuenta porque ninguna política la protege: sólo quien
es titular o administra.

Lo que la pantalla muestra sale de la vista `whatsapp_status`, que corre con
permisos de su dueño y devuelve estado y calidad, nunca credenciales. Hay una
prueba que confirma que ni quien acaba de cargar el token puede volver a leerlo.

Desconectar **borra la fila entera** en lugar de vaciar el token: una cuenta a
medias, con estado «conectada» y sin credenciales, es peor que ninguna.

Y el estado nunca lo decide quien carga los datos: se guarda como `pending`
hasta que Meta diga otra cosa.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Conectar y desconectar | `supabase/migrations/20260914100000_conexion_whatsapp.sql` |
| Vista de estado | la misma migración |
| Etiquetas | `src/lib/whatsapp.ts` |
| Lectura | `src/lib/data/whatsapp.ts` |
| Acciones | `src/lib/actions/whatsapp.ts` |
| Pantalla | `src/app/configuracion/whatsapp/` |
| Pruebas | `tests/rls/whatsapp.test.ts` |

## Lo que todavía no está

- **El Embedded Signup**, que es el punto de todo esto. Necesita que Dlay esté
  aprobada como Tech Provider.
- **Leer la salud desde Meta**: hoy el estado se actualiza cuando Meta avisa por
  webhook. Una consulta periódica daría el dato aunque no haya novedades.
- **Crear las plantillas desde el panel.** Hoy se cargan en el panel de Meta y
  se copia el nombre. Es además uno de los videos que pide el App Review.
- **El token en Vault**, que sigue pendiente de la fase 2.
