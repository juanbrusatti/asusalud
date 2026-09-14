# Despliegue

## Los tres entornos

| Dónde | Base de datos | Para qué |
| --- | --- | --- |
| Tu máquina | Supabase local (Docker) | Desarrollo diario y la suite de pruebas |
| Vercel · Preview | Proyecto de desarrollo | Cada rama y cada pull request |
| Vercel · Production | Proyecto del negocio | Lo que usa Asusalud |

La regla que no se rompe: **una rama nueva nunca corre contra la base de la
negocio**. Por eso Preview y Production apuntan a proyectos distintos.

El desarrollo local sigue contra Docker: es más rápido, no gasta cuota y la
suite de aislamiento habla directo con Postgres.

## 1. Las migraciones, en la base

```bash
scripts/deploy-db.sh prod
```

Saca la referencia del proyecto de la URL que hay en `.env.production.local`,
enlaza y aplica las migraciones en orden. Va a pedir la **contraseña de la
base**, que es la que se eligió al crear el proyecto; si no la tenés, se cambia
en *Settings → Database → Reset database password*.

Lo mismo para el otro proyecto:

```bash
scripts/deploy-db.sh preview
```

> **El enlace es global.** `supabase link` deja apuntado un solo proyecto a la
> vez, y todos los `npx supabase …` que vengan después van ahí. El script
> enlaza el que corresponde antes de empujar, pero para cualquier otro comando
> —`functions deploy`, `secrets set`— hay que asegurarse de estar enlazado al
> proyecto correcto. `cat supabase/.temp/project-ref` lo dice.

> Conviene hacer primero el de desarrollo. Si algo falla, falla donde no
> importa.

Después de aplicarlas, verificá en el panel de Supabase que estén las
extensiones `pg_cron` y `pg_net` (*Database → Extensions*). El planificador de
recordatorios y el emisor no funcionan sin ellas.

Si `db push` se corta en algún archivo, el mensaje dice **cuál** y con qué
error. Ese es el dato que hace falta: el resto de las migraciones no se
aplicaron, así que no hay nada que deshacer.

### No las apliques a mano

Es tentador pegar cada archivo en el SQL editor, y sale mal por tres motivos:

1. **El editor corre cada archivo como una sola transacción.** Si algo falla en
   la mitad, no queda *nada* de ese archivo: ni las tablas que sí se habían
   creado antes del error. El archivo siguiente entonces no encuentra las
   tablas del anterior y el error que se ve —«relation "public.tenants" does
   not exist»— apunta al archivo equivocado. El que falló es el de antes.
2. **No queda registro de lo aplicado.** `db push` anota cada migración en
   `supabase_migrations.schema_migrations`. Aplicándolas a mano esa tabla queda
   vacía, así que el primer `db push` que se corra después va a intentar
   aplicar las treinta de nuevo y va a fallar con «already exists».
3. **Son treinta archivos.** Uno salteado sin querer y el problema aparece
   semanas después.

### Si quedó a medias

Un proyecto recién creado no tiene nada que perder, así que lo más rápido es
empezar de cero. En el SQL editor:

```sql
-- Borra TODO lo de la aplicación. En un proyecto nuevo no hay nada más.
drop trigger if exists on_auth_user_created on auth.users;
drop schema if exists app cascade;
drop schema public cascade;

create schema public;
grant usage  on schema public to postgres, anon, authenticated, service_role;
grant all    on schema public to postgres, service_role;

-- Por si alguna migración llegó a anotarse.
delete from supabase_migrations.schema_migrations;
```

Y después, el `scripts/deploy-db.sh` de arriba.

> **Las cuentas no se borran con eso.** Viven en el esquema `auth`, que queda
> intacto. Si ya te habías registrado antes del reinicio, tu cuenta sobrevive
> pero su fila en `profiles` no, y después falla todo lo que guarda quién hizo
> algo: activar notificaciones, abrir la caja, cargar un turno desde la agenda.
> La migración `20260913120000_perfiles_huerfanos.sql` repone esas filas, así
> que alcanza con volver a correr `scripts/deploy-db.sh`.

Para ver en qué estado quedó antes de decidir:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by 1;
```

## 2. Las variables, en Vercel

```bash
npx vercel login
npx vercel link
scripts/vercel-env.sh prod
scripts/vercel-env.sh preview
```

Los valores salen de `.env.production.local` y `.env.preview.local`, que **git
ignora**. El script no los imprime.

| Variable | Production | Preview |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | proyecto del negocio | proyecto de desarrollo |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ídem | ídem |
| `NEXT_PUBLIC_SITE_URL` | el dominio real | se puede omitir |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | la misma en los dos | ídem |
| `SUPABASE_SERVICE_ROLE_KEY` | **nunca con `NEXT_PUBLIC_`** | ídem |

**La dirección del sitio vive en dos lugares y hacen cosas distintas**, así que
conviene no confundirlas:

| Dónde | Para qué | Si está mal |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` en Vercel | Mostrar el enlace de la reserva pública en pantalla | El negocio copia un enlace que no anda |
| `platform_settings.site_url` en la base | Armar el enlace del turno que viaja en los recordatorios | Los mensajes salen con un enlace muerto, y los que ya salieron no se arreglan |

La segunda es la que duele. Está en el paso 3.

> Las variables se aplican al **próximo** deploy. El que ya falló no se rehace
> solo: hay que volver a desplegar.

## 3. Las Edge Functions y sus ajustes

```bash
scripts/deploy-funciones.sh prod
```

Un solo comando hace todo: carga los secretos en Supabase, despliega el emisor
y el webhook, **comprueba que el portero los deje pasar** y escribe los tres
ajustes que viven dentro de la base (`dispatch_url`, `dispatch_secret`,
`site_url`).

> Antes esto terminaba con un SQL para pegar a mano en el panel. Era el paso
> que se olvidaba, y olvidarlo no da ningún error: la cola se llena y no la
> vacía nadie.

### El portero de Supabase

Las Edge Functions se despliegan exigiendo un JWT del proyecto y respondiendo
**401 antes de llegar a nuestro código**. Los dos que las llaman no tienen ni
pueden tener ese JWT: el reloj de Postgres manda el secreto compartido, y Meta
manda lo que manda Meta.

Por eso `supabase/config.toml` lleva:

```toml
[functions.dispatch]
verify_jwt = false

[functions.whatsapp-webhook]
verify_jwt = false
```

No las deja abiertas: el emisor compara `x-dlay-secret` y el webhook valida la
firma HMAC de Meta sobre el cuerpo crudo. Se defienden solas y mejor.

## 4. Comprobar que quedó andando

```bash
scripts/diagnostico.sh prod
```

Pregunta a la base en qué estado quedó cada eslabón. Devuelve cantidades y
ajustes faltantes, nunca datos de nadie, así que se puede pegar en un chat.

Lo que tiene que decir:

- `ajustes` — las tres claves puestas, ninguna en `FALTA`.
- `reloj` — dos tareas activas: planificar y despachar.
- `suscripciones.equipo` — al menos uno, si alguien activó las notificaciones.

Y desde la propia aplicación, el botón **Probar** al lado de las
notificaciones manda un aviso de prueba que recorre la cadena entera. Si llega
al teléfono, funciona todo.

## 5. Los secretos, en detalle

Las funciones corren en Supabase, no en Vercel, así que **sus secretos van en
Supabase**. Ponerlos en Vercel no hace nada: el emisor nunca los ve.

Viven en `.env.functions.prod.local`, que git ignora y el script carga solo:

| Secreto | Para qué |
| --- | --- |
| `DISPATCH_SECRET` | Lo genera el script la primera vez. La base lo manda en una cabecera y el emisor lo compara |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Firman las notificaciones push. Salen de `node scripts/vapid.mjs` |
| `VAPID_SUBJECT` | Un `mailto:` de contacto, que el estándar exige |
| `BREVO_API_KEY` | Sólo si vas a mandar correos |

Para agregar uno nuevo —la clave de Brevo, por ejemplo— se escribe en ese
archivo y se vuelve a correr `scripts/deploy-funciones.sh prod`.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola: no van
en ese archivo.

## 6. Después del primer deploy

### Primero: la confirmación por correo

En Supabase hosted, **«Confirm email» viene encendido**; en el entorno local
está apagado (`enable_confirmations = false` en `config.toml`). La diferencia
importa más de lo que parece: con la confirmación encendida, `signUp` crea el
usuario pero **no abre sesión**, así que el alta redirige al inicio, el guardia
no encuentra sesión y devuelve a la pantalla de ingreso. Se ve exactamente como
si el registro estuviera roto.

Dos salidas, en *Authentication → Sign In / Providers → Email*:

- **Apagar la confirmación** para dar de alta al titular, y volver a
  encenderla después. Es lo más rápido.
- **Dejarla encendida** y confirmar desde el correo. Tener en cuenta que el
  SMTP que Supabase presta tiene un límite de unos pocos envíos por hora y no
  sirve para producción: con confirmación encendida hay que configurar un SMTP
  propio (Brevo, el mismo de los recordatorios).

### Después

- Entrar y **crear el negocio**. El alta de cuenta crea la primera titular.
- Cargar **horarios de atención** en Ajustes: sin ellos la reserva online no
  ofrece ningún horario.
- Dejar el **modo de prueba encendido** en Ajustes → Envío de mensajes hasta
  que WhatsApp esté conectado. Es como nace y es deliberado.
- Revisar que la agenda, la caja y los informes se vean con datos reales.

## Dos cosas que hay que saber antes de facturar

**El plan Hobby de Vercel es para uso personal y no comercial.** Sirve para
probar; el día que el negocio paga por el sistema, hay que pasar a Pro. No es
una recomendación: es lo que dicen los términos.

**Un proyecto gratuito de Supabase se pausa tras una semana sin actividad.**
Para una agenda que se usa todos los días no debería pasar, pero un negocio
que cierra por vacaciones vuelve y encuentra la base dormida. Es otro motivo
para pasar a un plan pago antes de que esto sea el sistema del que dependen.

## Cuando algo no llega

```bash
cat scripts/diagnostico-avisos.sql
```

Se pega entero en el SQL editor del proyecto y devuelve una fila por cada cosa
que tiene que estar bien, en el orden en que se rompen. La primera que dice
algo raro es la que hay que arreglar; las de abajo son consecuencia.

Lo más común, por orden:

| Lo que se ve | Lo que suele ser |
| --- | --- |
| Cero suscripciones | «Activar notificaciones» no llegó a guardar |
| Hay turnos pero no avisos | El turno lo cargó el equipo: eso no avisa, a propósito |
| Avisos sin entregar | Falta el paso 4: nadie está sacando la cola |
| Hay un error de envío | El emisor corrió y falló; el texto dice por qué |

## Lo que todavía no está

- **Backups propios.** Supabase hace los suyos, pero una exportación periódica
  a otro lado es lo que salva de un borrado accidental.
- **Un dominio propio** en lugar del `.vercel.app`.
- **Separar los secretos de la Edge Function** en Vault, que sigue pendiente.
