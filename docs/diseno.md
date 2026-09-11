# Sistema de diseño

Identidad Dlay: artesanal pero moderno. Un producto digital prolijo con alma
hecha a mano.

## Paleta

Monocromática con **un único color de acento**, que aparece sólo en bloques
sólidos: nunca en degradados ni acompañado de otros colores vivos.

| Token | Claro | Oscuro |
| --- | --- | --- |
| `paper` | `#F5F3EE` hueso | `#0A0A0A` negro |
| `surface` | `#FFFFFF` | `#141414` |
| `ink` | `#0A0A0A` | `#F5F3EE` |
| `line` | `#E3DFD5` | `#2A2A2A` |
| `accent` | `#3E3FE0` | `#3E3FE0` |
| `accent-text` | `#3E3FE0` | `#9192F7` |

El acento es el mismo en los dos temas para los bloques llenos. Para texto y
enlaces sobre negro se usa `accent-text`, más claro, porque el índigo puro no
llega al contraste mínimo sobre fondo oscuro.

Los colores semánticos (`danger`, `warn`) están separados del acento a
propósito: el índigo es la marca, no un estado.

## Los tres estados del tema

El tema no tiene dos estados sino tres. Una elección explícita deja
`data-theme="dark"` o `"light"` en `<html>`; la opción por defecto del sistema
**no deja nada**, y ahí sólo manda `prefers-color-scheme`.

Por eso en `globals.css` cada token se declara completo en `:root` y se
redefine en los otros dos bloques. **Ningún color puede existir únicamente
dentro de un media query**: si pasa, la página termina mostrando el texto de un
tema sobre el fondo del otro.

## Tipografía

Dos familias que contrastan a propósito:

- **Inter** para toda la interfaz: navegación, precios, formularios, botones.
- **Caveat** para titulares y momentos de marca. Nada de texto corrido.

Caveat aparece en el saludo, en los datos clave de las tarjetas y en el nombre
del producto. Es lo que le da el aire de etiqueta escrita a mano.

## Ilustración

Trazo grueso y uniforme, dibujado a mano, estilo cómic editorial. Blanco sobre
los bloques de acento, negro sobre fondo claro. Rellenos planos en negro puro
para contraste, y **un único elemento coloreado con el índigo** como spot
color: todo lo demás queda en blanco y negro.

El logo (`src/components/brand/logo.tsx`) sigue esa regla: la D en el color de
la tinta y el punto en índigo.

## Componentes

| Componente | Notas |
| --- | --- |
| `Button` | Píldora. `solid` usa el acento como bloque lleno. Altura 44px en `md`: el mínimo cómodo para un pulgar |
| `Card` | Radio 22px. Con `accent` se vuelve un bloque índigo |
| `CardFigure` | El dato clave, en manuscrita |
| `Field` | Etiqueta, ayuda y error. La ayuda va **visible**, no escondida en un tooltip |

## Reglas de uso

- **El acento, en un solo lugar por pantalla.** Si compite consigo mismo deja
  de señalar nada.
- **Mucho espacio negativo, poca densidad por bloque.**
- **Sin animaciones decorativas.** `prefers-reduced-motion` está respetado en
  la capa base.
- **Los textos de ayuda se escriben desde el lado de quien usa el sistema**: se
  nombra lo que la persona reconoce, no cómo está construido por dentro.
