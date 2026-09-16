"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import {
  escribirGuardado,
  leerGuardado,
  llaveWhatsapp,
  useHidratado,
} from "@/lib/navegador";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { conectarWhatsapp, type ConexionState } from "@/lib/actions/whatsapp";
import { Guardar, Resultado } from "../_components/guardar";

/**
 * El alta de WhatsApp, de a un paso por vez.
 *
 * Antes esta pantalla era una lista de cinco pasos escritos en pasado —«creá
 * una aplicación», «generá un token»— y después un formulario con cuatro
 * campos vacíos al final. Eso funciona si ya sabés dónde está cada cosa. Si no
 * sabés, no hay forma de empezar: la lista no dice a qué dirección ir, y el
 * formulario pide cuatro valores sin decir de dónde salen.
 *
 * Acá se ve un solo paso a la vez, cada uno con el enlace exacto al que hay
 * que ir, qué tocar cuando llegás, y el campo para pegar lo que encontraste
 * justo debajo. Lo que se pega en un paso no se vuelve a pedir nunca más.
 *
 * El identificador de la app se pide segundo y no por capricho: con él se
 * arman las direcciones de todos los pasos que siguen, así que a partir de
 * ahí nadie tiene que buscar nada en el menú de Meta.
 */

type Datos = {
  appId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhone: string;
  accessToken: string;
  appSecret: string;
};

const VACIO: Datos = {
  appId: "",
  phoneNumberId: "",
  wabaId: "",
  displayPhone: "",
  accessToken: "",
  appSecret: "",
};

/**
 * Lo que se recuerda entre visitas.
 *
 * El token y la clave secreta no están en esta lista a propósito: son
 * credenciales, y el navegador no es lugar para guardarlas. Quedan en memoria
 * mientras dura el alta y viajan al servidor al confirmar. Si alguien deja el
 * alta por la mitad después de pegar el token, lo va a tener que pegar de
 * nuevo — y eso es correcto.
 */
const RECORDABLES = ["appId", "phoneNumberId", "wabaId", "displayPhone"] as const;

const INICIAL: ConexionState = { error: null };

type Campo = {
  clave: keyof Datos;
  label: string;
  hint: string;
  requerido?: boolean;
  secreto?: boolean;
  placeholder?: string;
};

type Paso = {
  titulo: string;
  /** Qué se logra con este paso, en una línea. */
  resumen: string;
  enlace?: { href: string; texto: string };
  cuerpo: ReactNode;
  campos?: Campo[];
};

function Instrucciones({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed">
          <span className="mt-[0.15em] shrink-0 text-faint tabular-nums">
            {i + 1}.
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Lo que se toca en Meta. Va resaltado para poder buscarlo con la vista. */
function Toca({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}

export function Asistente({
  tenantId,
  verifyToken,
}: {
  tenantId: string;
  verifyToken: string;
}) {
  const [state, action] = useActionState(conectarWhatsapp, INICIAL);
  const listo = useHidratado();
  const llave = llaveWhatsapp(tenantId);

  // El valor inicial se lee una sola vez, al construir el estado. En el
  // servidor devuelve vacío, y como abajo no se dibuja nada hasta que termina
  // la hidratación, los dos lados coinciden.
  const [datos, setDatos] = useState<Datos>(() => ({
    ...VACIO,
    ...leerGuardado<Datos>(llave),
  }));
  const [paso, setPaso] = useState(
    () => leerGuardado<{ paso: number }>(llave).paso ?? 0,
  );

  useEffect(() => {
    if (!listo) return;
    const guardable: Record<string, unknown> = { paso };
    for (const clave of RECORDABLES) guardable[clave] = datos[clave];
    escribirGuardado(llave, guardable);
  }, [datos, paso, listo, llave]);

  const set = (clave: keyof Datos) => (valor: string) =>
    setDatos((d) => ({ ...d, [clave]: valor }));

  /**
   * Las direcciones de Meta que dependen de la app.
   *
   * Mientras no sepamos el identificador se manda a la lista de aplicaciones,
   * que es lo mejor que se puede hacer sin él. En cuanto lo tenemos, cada
   * botón abre la pantalla exacta.
   */
  const app = datos.appId.trim();
  const enMeta = (ruta: string) =>
    app
      ? `https://developers.facebook.com/apps/${encodeURIComponent(app)}/${ruta}`
      : "https://developers.facebook.com/apps/";

  const pasos: Paso[] = [
    {
      titulo: "Creá tu cuenta de Meta Business",
      resumen: "La cuenta desde la que Meta ve tu negocio.",
      enlace: {
        href: "https://business.facebook.com/",
        texto: "Abrir Meta Business",
      },
      cuerpo: (
        <Instrucciones
          items={[
            <>
              Entrá con tu usuario de Facebook. Sirve el personal: tus clientes
              no lo van a ver en ningún lado.
            </>,
            <>
              Si te pide crear un portafolio comercial, ponele el nombre de tu
              negocio, tu nombre y tu correo.
            </>,
            <>
              Si ya tenías una cuenta de Meta Business, no hace falta crear
              nada: seguí al paso siguiente.
            </>,
          ]}
        />
      ),
    },
    {
      titulo: "Creá la aplicación",
      resumen: "Es el permiso que deja que Dlay mande por tu número.",
      enlace: {
        href: "https://developers.facebook.com/apps/create/",
        texto: "Crear la aplicación",
      },
      cuerpo: (
        <>
          <Instrucciones
            items={[
              <>
                Cuando te pregunte qué querés que haga tu app, elegí la opción
                que menciona <Toca>WhatsApp</Toca>. Si no aparece, elegí{" "}
                <Toca>Otro</Toca> y después <Toca>Empresa</Toca>.
              </>,
              <>
                Ponele un nombre. El de tu negocio alcanza, y tampoco lo ven tus
                clientes.
              </>,
              <>
                Cuando termine, Meta te deja en el panel de la app. Arriba de
                todo dice <Toca>Identificador de la app</Toca>, con una fila de
                números debajo.
              </>,
            ]}
          />
          <p className="rounded-[14px] bg-accent-wash px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            Pegá ese número acá abajo y no vas a tener que buscar nada más: los
            pasos que siguen te van a llevar directo a cada pantalla.
          </p>
        </>
      ),
      campos: [
        {
          clave: "appId",
          label: "Identificador de la app",
          requerido: true,
          placeholder: "1111439061239674",
          hint: "Meta lo llama «App ID». Son sólo números.",
        },
      ],
    },
    {
      titulo: "Agregá tu número y verificalo",
      resumen: "El número desde el que van a salir los recordatorios.",
      enlace: {
        href: enMeta("whatsapp-business/wa-dev-console/"),
        texto: "Abrir la configuración de WhatsApp",
      },
      cuerpo: (
        <>
          <Instrucciones
            items={[
              <>
                En <Toca>Enviar y recibir mensajes</Toca>, al lado de{" "}
                <Toca>Número de teléfono</Toca>, tocá{" "}
                <Toca>Agregar número de teléfono</Toca>.
              </>,
              <>
                Escribí el número nuevo, elegí si querés el código por mensaje o
                por llamada, y confirmalo.
              </>,
              <>
                Te va a pedir también el nombre con el que te van a ver tus
                clientes cuando les llegue el mensaje. Poné el de tu negocio.
              </>,
              <>
                Volvé a esa misma pantalla: debajo del número aparecen los dos
                identificadores que hay que traer.
              </>,
            ]}
          />
          <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            Acordate: ese número deja de funcionar en la aplicación de WhatsApp
            del teléfono. Tiene que ser uno nuevo.
          </p>
        </>
      ),
      campos: [
        {
          clave: "phoneNumberId",
          label: "Identificador del número",
          requerido: true,
          placeholder: "123456789012345",
          hint: "Dice «Identificador del número de teléfono». Es una fila larga de números, no tu teléfono.",
        },
        {
          clave: "wabaId",
          label: "Identificador de la cuenta de WhatsApp",
          placeholder: "Opcional",
          hint: "Un poco más abajo, como «Identificador de la cuenta de WhatsApp Business». Sirve para mostrarte la calidad del número.",
        },
        {
          clave: "displayPhone",
          label: "Tu número, como lo ven tus clientes",
          placeholder: "+54 9 358 412-3456",
          hint: "Opcional. Es sólo para reconocerlo en esta pantalla.",
        },
      ],
    },
    {
      titulo: "Generá el token permanente",
      resumen: "La llave que no vence. Es el paso más largo de todos.",
      enlace: {
        href: "https://business.facebook.com/settings/system-users",
        texto: "Abrir usuarios del sistema",
      },
      cuerpo: (
        <>
          <p className="text-[13.5px] leading-relaxed text-muted">
            Meta muestra de entrada un token que dura 24 horas. Ese no sirve: al
            día siguiente los recordatorios dejan de salir. El que no vence se
            genera acá, y son seis toques.
          </p>
          <Instrucciones
            items={[
              <>
                Tocá <Toca>Agregar</Toca>. Ponele un nombre —«Dlay» sirve—,
                elegí el rol <Toca>Administrador</Toca> y crealo.
              </>,
              <>
                Con ese usuario seleccionado, tocá <Toca>Asignar activos</Toca>,
                elegí <Toca>Apps</Toca>, marcá la app que creaste recién y
                activá <Toca>Control total</Toca>. Guardá.
              </>,
              <>
                Tocá <Toca>Generar token nuevo</Toca> y elegí tu app.
              </>,
              <>
                En <Toca>Vencimiento</Toca> elegí <Toca>Nunca</Toca>. Este es el
                paso que más se saltea.
              </>,
              <>
                En la lista de permisos marcá{" "}
                <Toca>whatsapp_business_messaging</Toca> y{" "}
                <Toca>whatsapp_business_management</Toca>.
              </>,
              <>
                Tocá <Toca>Generar token</Toca> y copiá lo que aparece.
              </>,
            ]}
          />
          <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            Meta te muestra el token una sola vez. Si cerrás esa ventana sin
            copiarlo, no se puede recuperar: hay que generar otro.
          </p>
        </>
      ),
      campos: [
        {
          clave: "accessToken",
          label: "Token permanente",
          requerido: true,
          secreto: true,
          placeholder: "EAA…",
          hint: "Empieza con EAA y es muy largo. Pegalo entero.",
        },
      ],
    },
    {
      titulo: "Copiá la clave secreta",
      resumen: "Sirve para saber que cada aviso viene de verdad de Meta.",
      enlace: {
        href: enMeta("settings/basic/"),
        texto: "Abrir la configuración básica",
      },
      cuerpo: (
        <>
          <Instrucciones
            items={[
              <>
                Buscá <Toca>Clave secreta de la app</Toca> y tocá{" "}
                <Toca>Mostrar</Toca>.
              </>,
              <>
                Te va a pedir tu contraseña de Facebook. Es normal: es para
                confirmar que sos vos.
              </>,
              <>Copiá lo que aparece y pegalo acá abajo.</>,
            ]}
          />
          <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            Si te la salteás, los mensajes salen igual, pero las respuestas no
            vuelven: cuando tu cliente apriete <Toca>Confirmar</Toca>, en tu
            agenda no va a pasar nada.
          </p>
        </>
      ),
      campos: [
        {
          clave: "appSecret",
          label: "Clave secreta de la app",
          secreto: true,
          placeholder: "Muy recomendable",
          hint: "Meta la llama «App secret». Son letras y números, más corta que el token.",
        },
      ],
    },
  ];

  const total = pasos.length;
  const actual = pasos[Math.min(paso, total - 1)];
  const enElFinal = paso >= total;

  const faltan = (p: Paso) =>
    (p.campos ?? []).some((c) => c.requerido && !datos[c.clave].trim());

  // Mientras no se leyó el navegador no se dibuja nada del avance: mostrar el
  // paso 1 y saltar al 4 medio segundo después es peor que esperar.
  if (!listo) {
    return (
      <Card>
        <CardBody>
          <p className="text-[14px] text-muted">Abriendo el asistente…</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="grid gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Conectemos tu WhatsApp</CardTitle>
          <span className="text-[12.5px] font-medium text-faint tabular-nums">
            {enElFinal ? "Último paso" : `Paso ${paso + 1} de ${total}`}
          </span>
        </div>

        <div
          className="h-1 w-full overflow-hidden rounded-pill bg-line-soft"
          role="presentation"
        >
          <div
            className="h-full rounded-pill bg-accent transition-[width] duration-300"
            style={{ width: `${(Math.min(paso, total) / total) * 100}%` }}
          />
        </div>

        {/* Los pasos ya hechos, plegados. Se pueden reabrir: alguien va a
            querer volver a mirar qué pegó, y esconderlo del todo obliga a
            empezar de nuevo. */}
        {paso > 0 && (
          <ul className="grid gap-1.5">
            {pasos.slice(0, paso).map((p, i) => (
              <li key={p.titulo}>
                <button
                  type="button"
                  onClick={() => setPaso(i)}
                  className="flex w-full items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-wash text-[11px] font-bold text-ok">
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted">
                    {p.titulo}
                  </span>
                  <span className="shrink-0 text-[12px] text-faint">Ver</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!enElFinal && (
          <div className="grid gap-4 rounded-card border-[1.5px] border-line bg-surface-2 p-4 sm:p-5">
            <div>
              <p className="text-[15.5px] font-semibold leading-snug">
                {actual.titulo}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                {actual.resumen}
              </p>
            </div>

            {actual.enlace && (
              <div className="flex">
                <Button asChild size="sm">
                  <a
                    href={actual.enlace.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {actual.enlace.texto} ↗
                  </a>
                </Button>
              </div>
            )}

            <div className="grid gap-3">{actual.cuerpo}</div>

            {actual.campos && (
              <div className="grid gap-4 border-t-[1.5px] border-line pt-4">
                {actual.campos.map((c) => (
                  <Field
                    key={c.clave}
                    label={c.label}
                    hint={c.hint}
                    placeholder={c.placeholder}
                    type={c.secreto ? "password" : "text"}
                    autoComplete="off"
                    value={datos[c.clave]}
                    onChange={(e) => set(c.clave)(e.target.value)}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setPaso(paso + 1)} disabled={faltan(actual)}>
                {paso + 1 === total ? "Terminar" : "Listo, seguir"}
              </Button>
              {paso > 0 && (
                <Button variant="ghost" onClick={() => setPaso(paso - 1)}>
                  Atrás
                </Button>
              )}
            </div>

            {faltan(actual) && (
              <p className="-mt-2 text-[12.5px] text-faint">
                Completá lo de arriba para seguir.
              </p>
            )}
          </div>
        )}

        {enElFinal && (
          <form action={action} className="grid gap-4">
            <div className="grid gap-3 rounded-card border-[1.5px] border-line bg-surface-2 p-4 sm:p-5">
              <p className="text-[15.5px] font-semibold">Ya está todo</p>
              <p className="text-[13.5px] leading-relaxed text-muted">
                Esto es lo que vamos a guardar. El token y la clave secreta se
                guardan del lado del servidor y no vuelven a mostrarse acá
                nunca más.
              </p>

              <dl className="grid gap-1.5 border-t-[1.5px] border-line pt-3 text-[13.5px]">
                {[
                  ["Identificador del número", datos.phoneNumberId],
                  ["Cuenta de WhatsApp", datos.wabaId || "Sin cargar"],
                  ["Tu número", datos.displayPhone || "Sin cargar"],
                  ["Token permanente", datos.accessToken ? "Cargado" : "Falta"],
                  [
                    "Clave secreta",
                    datos.appSecret ? "Cargada" : "Sin cargar",
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="min-w-0 truncate">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <input type="hidden" name="phoneNumberId" value={datos.phoneNumberId} />
            <input type="hidden" name="accessToken" value={datos.accessToken} />
            <input type="hidden" name="wabaId" value={datos.wabaId} />
            <input type="hidden" name="displayPhone" value={datos.displayPhone} />
            <input type="hidden" name="appSecret" value={datos.appSecret} />
            <input type="hidden" name="verifyToken" value={verifyToken} />

            <Resultado state={state} />

            <p className="text-[13px] leading-relaxed text-muted">
              Después de conectar quedan dos cosas más, las dos acompañadas y
              más cortas que esto: enganchar las respuestas de los botones y
              crear las plantillas.
            </p>

            <div className="flex flex-wrap gap-2">
              <Guardar label="Conectar WhatsApp" />
              <Button variant="ghost" onClick={() => setPaso(total - 1)}>
                Atrás
              </Button>
            </div>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
