# Seguridad

Guardamos el teléfono, el historial de tratamientos y el gasto de miles de
personas reales. El aislamiento entre estéticas está en la base de datos, no en
un `if` del código de la aplicación.

## Principios

1. **RLS activa y forzada en todas las tablas de `public`**, sin excepción,
   desde la primera migración. Una tabla sin política es una fuga.
2. **`anon` no recibe ningún permiso.** Ni siquiera SELECT. La reserva pública,
   cuando llegue, va a hablar con funciones `SECURITY DEFINER` que devuelven
   sólo disponibilidad, nunca con estas tablas.
3. **`service_role` jamás sale del servidor.** Si aparece en el bundle del
   navegador, el sistema entero está abierto.
4. **Esconder un botón no es seguridad.** Los chequeos de rol en la interfaz
   deciden qué mostrar; quien decide qué datos salen es la base.

## Cómo funcionan las políticas

Cuatro funciones en el esquema `app` sostienen todas las políticas del sistema.
Son `SECURITY DEFINER` a propósito: leen `memberships` salteándose la RLS de esa
tabla, que es lo que evita la recursión infinita (la política de `memberships`
necesitaría consultarse a sí misma).

Se invocan siempre envueltas en `(select ...)`:

```sql
create policy "branches: ver las de mis estéticas"
  on public.branches for select to authenticated
  using ( (select app.has_tenant(tenant_id)) );
```

El `(select ...)` hace que Postgres evalúe la función **una vez por sentencia**
como InitPlan, en lugar de una vez por fila. Sobre miles de turnos es la
diferencia entre 3 ms y 300 ms.

### Por qué no van los datos del tenant en el JWT

Sería más rápido, pero un token vive hasta una hora: quitarle el acceso a
alguien no tendría efecto hasta que su token expire. Con las funciones, revocar
una membresía corta el acceso en la consulta siguiente. Cuando el volumen lo
justifique se puede sumar el claim como caché, pero la fuente de verdad se
queda en la tabla.

## Permisos: hacen falta los dos

RLS filtra filas; `GRANT` decide si la tabla es visible. Una tabla con RLS pero
sin `GRANT` da error de permisos; una con `GRANT` y sin política, no devuelve
nada. Cada migración hace las dos cosas de forma explícita, incluido el
`revoke all ... from anon`.

## `force row level security`

Todas las tablas la tienen. Sin eso, cualquier conexión que corra como dueño de
la tabla —una migración, un script, una consola— se saltea las políticas sin
darse cuenta y puede filtrar datos entre estéticas en un `INSERT ... SELECT`
inocente.

## La suite de aislamiento

`tests/rls/isolation.test.ts` levanta el escenario de siempre: dos estéticas que
no se conocen y un intento explícito de que una lea o escriba sobre la otra.

Cubre: alta de estética, aislamiento de tenants, sucursales, membresías y
perfiles, el visitante sin sesión, los cuatro roles, la escalada a dueño, la
última membresía de dueño, la suspensión y la bitácora.

```bash
npm test
```

> **Ninguna funcionalidad que toque datos se da por terminada sin su prueba
> acá.** Si devuelve una sola fila ajena, la función no está lista.

Las pruebas hablan directo con Postgres y no con PostgREST, para verificar la
RLS en sí misma y no la capa HTTP que la envuelve.

## Autenticación

- Contraseña mínima de 8 caracteres, validada en el servidor.
- Correo o contraseña incorrectos devuelven **el mismo mensaje**: decir cuál de
  los dos falló le confirma a un tercero qué correos existen.
- El proxy usa `getUser()`, que revalida el token contra Supabase, y no
  `getSession()`, que sólo lee una cookie manipulable.

## Pendiente para las próximas fases

| Cuándo | Qué |
| --- | --- |
| Fase 2 | Verificar la firma `X-Hub-Signature-256` de los webhooks de Meta |
| Fase 2 | Guardar los tokens de WhatsApp cifrados en Supabase Vault |
| Fase 2 | Límite de intentos y captcha en la reserva pública |
| Fase 3 | Que los movimientos de caja sean inmutables: se corrigen con contramovimiento |
