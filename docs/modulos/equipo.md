# Tu equipo

## Qué es

Quiénes más entran al sistema, y con qué permisos.

Los cuatro roles existían **desde el primer día**: la RLS los respeta en todas
las tablas, las pantallas esconden lo que no corresponde y hay pruebas de que
quien atiende no ve la caja ni la cuenta. Lo que faltaba era una puerta: toda
membresía nacía dentro de `create_tenant`, que te hace titular de un negocio
nuevo. O sea que una empleada que se registraba **se creaba su propia estética
vacía**, y el negocio terminaba compartiendo una sola cuenta entre todas.

Con una cuenta compartida, el registro de quién hizo qué no sirve para nada: la
nota de la ficha, el movimiento de caja y el cambio de estado del turno los
firma siempre la misma persona.

## La invitación es un enlace, no un correo

A propósito. Esta gente se manda todo por WhatsApp; un correo más es un correo
que termina en no deseado y una empleada que nunca entra.

Se genera desde *Ajustes → Tu equipo*, se copia y se manda por donde sea.

- **Sirve una sola vez.** Al usarse queda marcada con quién la usó.
- **Vence en una semana.**
- **Si la usa alguien que ya está en el equipo, no se quema**: el enlace no era
  para esa persona.
- **Diez sin usar como máximo**, para que un enlace filtrado no se convierta en
  una fábrica de invitaciones.

Quien llega sin sesión pasa por entrar o por crear cuenta, y vuelve al enlace.
Eso funciona porque el `volver` del guardia ahora se respeta — antes se
escribía y no lo leía nadie, así que quien entraba terminaba siempre en el
inicio. Sólo se aceptan rutas propias: sin esa comprobación,
`/entrar?volver=https://otro-sitio` manda a alguien recién autenticado a un
sitio ajeno con cara de que lo mandamos nosotros.

## Los roles

| Rol | Qué ve |
|---|---|
| Titular | Todo, incluida la cuenta de Dlay. Es quien creó el negocio. |
| Administración | Todo menos dar de baja el negocio. |
| Recepción | Agenda, clientes y caja. No toca precios ni configuración. |
| Profesional | Su agenda y las fichas. No ve la caja ni la cuenta. |

**Al titular no se lo puede invitar ni sacar.** Es quien responde por la
cuenta, y que haya dos es una discusión sobre quién puede echar a quién.
Tampoco te podés sacar a vos misma.

Sacar a alguien le borra la membresía, y con eso la RLS deja de devolverle el
negocio: no es una pantalla escondida, es que la base no le contesta.

## Lo que todavía no está

- **Cambiarle el rol a alguien** sin sacarlo y volver a invitarlo.
- **Suspender en vez de sacar**, para quien se va de licencia.
- **Que el turno diga quién atiende**: `staff_id` existe y la interfaz no lo
  usa mientras haya una sola profesional. Es lo que le daría sentido completo
  al rol de profesional.
