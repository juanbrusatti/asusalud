import { createClient } from "jsr:@supabase/supabase-js@2";
import { ETIQUETA_BOTON, paraMeta } from "../_shared/plantillas.ts";

/**
 * Revisar la conexión de WhatsApp.
 *
 * Los cinco pasos de Meta terminan sin que nadie te diga si quedaron bien. El
 * token puede estar vencido, la plantilla puede haberse aprobado con otro
 * nombre, el número puede no estar registrado. Todo eso se descubre recién
 * cuando el primer recordatorio no llega — y lo peor de un mensaje que no
 * llega es que nadie se entera de que no llegó.
 *
 * Esto le pregunta a Meta las tres cosas, en el orden en que se rompen, y
 * traduce lo que contesta. Los códigos de error de Meta son crípticos a
 * propósito para quien no es técnico: «#132001» no le dice nada a nadie, «la
 * plantilla no existe con ese nombre» sí.
 *
 * Corre acá y no en la aplicación por dos motivos: el token no sale nunca de
 * Supabase, y esto prueba exactamente el mismo camino de red por el que salen
 * los mensajes de verdad.
 */

const GRAPH = "v21.0";

type Paso = {
  clave: string;
  titulo: string;
  ok: boolean;
  detalle: string;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type ErrorMeta = {
  code?: number;
  message?: string;
  error_user_title?: string;
  error_user_msg?: string;
};

/**
 * Lo que dice Meta, en castellano y con qué hacer al respecto.
 *
 * Siempre se agrega lo que dijo Meta con sus palabras. La traducción sola ya
 * hizo daño una vez: el código 100 es un cajón de sastre —lo usa para IDs mal
 * copiados y también para cualquier cosa del cuerpo de una plantilla— y
 * traducirlo a una sola causa mandó a revisar lo único que estaba bien.
 */
function traducir(err: ErrorMeta | undefined): string {
  const mio = porCodigo(err?.code);
  const deMeta = (err?.error_user_msg ?? err?.message ?? "").trim();

  if (mio && deMeta) return `${mio} · Meta dice: «${deMeta}»`;
  if (mio) return mio;
  if (deMeta) return `Meta lo rechazó: «${deMeta}»`;
  return "Meta rechazó el pedido y no explicó por qué.";
}

function porCodigo(code: number | undefined): string {
  switch (code) {
    case 190:
      return "El token venció o fue revocado. Hay que generar uno nuevo en Meta y volver a pegarlo acá.";
    case 200:
    case 10:
      return "El token no tiene permiso para este número. Suele pasar cuando se generó para otra app o sin los permisos de WhatsApp.";
    case 100:
      // Es el código genérico de Meta: lo usa para identificadores mal
      // copiados y para cualquier problema del contenido de una plantilla.
      // Por eso acá no se afirma la causa: la dice Meta abajo.
      return "Meta rechazó algo del pedido";
    case 131030:
      return "Ese número no está en la lista de destinatarios permitidos. Con el número de prueba de Meta sólo se puede escribir a los cinco que hayas verificado.";
    case 132000:
      return "La plantilla espera otra cantidad de datos que los que mandamos. Suele ser que el texto aprobado en Meta no coincide con el de acá.";
    case 132001:
      return "Meta no encuentra la plantilla. Si todavía no las creaste, tocá «Crear las plantillas en Meta» acá abajo. Si ya la ves en Meta, el nombre no coincide: tiene que ser idéntico, guiones bajos incluidos.";
    case 132005:
      return "La plantilla está aprobada pero el texto no coincide con el que tenemos guardado.";
    case 133010:
      return "El número todavía no está registrado en la API. Falta terminar el registro en Meta.";
    case 131047:
      return "Pasaron más de 24 horas desde el último mensaje de esa persona, así que sólo se le puede escribir con una plantilla aprobada.";
    case 131026:
      return "Ese número no tiene WhatsApp, o no puede recibir mensajes.";
    case 368:
    case 131031:
      return "Meta restringió la cuenta. Hay que entrar al panel de Meta y ver qué pide.";
    default:
      return "";
  }
}

async function preguntar(
  url: string,
  token: string,
): Promise<{ ok: boolean; datos: Record<string, unknown>; detalle: string }> {
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const datos = (await r.json()) as Record<string, unknown>;

    if (!r.ok) {
      const err = datos.error as ErrorMeta | undefined;
      return {
        ok: false,
        datos,
        detalle: traducir(err),
      };
    }
    return { ok: true, datos, detalle: "" };
  } catch (e) {
    return {
      ok: false,
      datos: {},
      detalle: `No se pudo hablar con Meta: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
}

type Plantilla = {
  nombre: string;
  en_meta: string;
  idioma: string;
  cuerpo?: string;
  categoria?: string;
  quick_replies?: string[];
};

/** Borra una plantilla de Meta por nombre. */
async function borrarPlantilla(
  waba: string,
  token: string,
  nombre: string,
): Promise<boolean> {
  try {
    const r = await fetch(
      `https://graph.facebook.com/${GRAPH}/${waba}/message_templates?name=${encodeURIComponent(nombre)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    return r.ok;
  } catch {
    return false;
  }
}

/** El cuerpo que Meta tiene hoy para esa plantilla, si la tiene. */
function cuerpoEnMeta(
  m: { components?: Array<{ type?: string; text?: string }> } | undefined,
): string {
  return (
    m?.components?.find((c) => (c.type ?? "").toUpperCase() === "BODY")?.text ??
    ""
  );
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Meta avisa que el borrado anterior todavía se está propagando. */
function borradoEnCurso(detalle: string): boolean {
  const t = detalle.toLowerCase();
  return t.includes("mientras se elimina") || t.includes("while deleting");
}

/** Crea una plantilla en Meta. Si ya existe, lo dice sin tratarlo como error. */
async function crearPlantilla(
  waba: string,
  token: string,
  p: Plantilla,
): Promise<Paso> {
  const { texto, ejemplos } = paraMeta(p.cuerpo ?? "");

  const components: Array<Record<string, unknown>> = [
    {
      type: "BODY",
      text: texto,
      ...(ejemplos.length > 0
        ? { example: { body_text: [ejemplos] } }
        : {}),
    },
  ];

  const botones = (p.quick_replies ?? []).map((b) => ({
    type: "QUICK_REPLY",
    text: ETIQUETA_BOTON[b] ?? b,
  }));

  if (botones.length > 0) {
    components.push({ type: "BUTTONS", buttons: botones });
  }

  try {
    const r = await fetch(
      `https://graph.facebook.com/${GRAPH}/${waba}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: p.en_meta,
          language: p.idioma,
          category: p.categoria === "MARKETING" ? "MARKETING" : "UTILITY",
          components,
        }),
      },
    );
    const datos = (await r.json()) as Record<string, unknown>;

    if (r.ok) {
      return {
        clave: `plantilla-${p.en_meta}`,
        titulo: p.nombre,
        ok: true,
        detalle: `Creada en Meta como «${p.en_meta}». Queda esperando aprobación, que suele tardar minutos.`,
      };
    }

    const err = datos.error as ErrorMeta | undefined;

    // Ya existía: no es un problema, es el estado al que queríamos llegar.
    if (
      err?.code === 100 &&
      (err.message ?? "").toLowerCase().includes("already exists")
    ) {
      return {
        clave: `plantilla-${p.en_meta}`,
        titulo: p.nombre,
        ok: true,
        detalle: `Ya existía en Meta con el nombre «${p.en_meta}». No se tocó.`,
      };
    }

    return {
      clave: `plantilla-${p.en_meta}`,
      titulo: p.nombre,
      ok: false,
      detalle: traducir(err),
    };
  } catch (e) {
    return {
      clave: `plantilla-${p.en_meta}`,
      titulo: p.nombre,
      ok: false,
      detalle: `No se pudo hablar con Meta: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("método no permitido", { status: 405 });
  }

  const { tenantId, destino, accion } = (await req.json()) as {
    tenantId?: string;
    destino?: string;
    accion?: "revisar" | "crear-plantillas";
  };

  if (!tenantId) {
    return Response.json({ error: "Falta el negocio." }, { status: 400 });
  }

  const { data: cred } = await supabase.rpc("rpc_whatsapp_credentials", {
    p_tenant: tenantId,
  });

  const c = cred as {
    phone_number_id?: string;
    waba_id?: string;
    access_token?: string;
    templates?: Plantilla[];
  } | null;

  if (!c?.access_token || !c.phone_number_id) {
    return Response.json({
      pasos: [
        {
          clave: "conexion",
          titulo: "La cuenta está conectada",
          ok: false,
          detalle: "Todavía no cargaste las credenciales de Meta.",
        },
      ],
    });
  }

  const pasos: Paso[] = [];

  // ---------------------------------------------------------------------
  // Crear las plantillas, si eso es lo que se pidió
  // ---------------------------------------------------------------------
  if (accion === "crear-plantillas") {
    if (!c.waba_id) {
      return Response.json({
        pasos: [
          {
            clave: "waba",
            titulo: "Crear las plantillas",
            ok: false,
            detalle:
              "Falta el identificador de la cuenta de WhatsApp (WABA). Cargalo en las credenciales y volvé a intentar.",
          },
        ],
      });
    }

    // Qué hay hoy en Meta. Sin esto, una plantilla rechazada deja trabado
    // para siempre: crear de nuevo da «already exists» y no hay forma de
    // reemplazarla desde acá.
    const lista = await preguntar(
      `https://graph.facebook.com/${GRAPH}/${c.waba_id}/message_templates` +
        `?fields=name,status,language,components&limit=200`,
      c.access_token,
    );

    const enMeta = (
      lista.ok ? ((lista.datos.data ?? []) as Array<Record<string, unknown>>) : []
    ) as Array<{
      name: string;
      status: string;
      language: string;
      components?: Array<{ type?: string; text?: string }>;
    }>;

    for (const p of c.templates ?? []) {
      const actual = enMeta.find(
        (m) => m.name === p.en_meta && m.language === p.idioma,
      );

      if (actual) {
        const estado = (actual.status ?? "").toUpperCase();
        const nuestro = paraMeta(p.cuerpo ?? "").texto;
        const suyo = cuerpoEnMeta(actual);

        if (estado === "APPROVED" && suyo === nuestro) {
          pasos.push({
            clave: `plantilla-${p.en_meta}`,
            titulo: p.nombre,
            ok: true,
            detalle: "Ya está aprobada en Meta y coincide con el texto de acá.",
          });
          await supabase.rpc("rpc_mark_template_status", {
            p_tenant: tenantId,
            p_provider_name: p.en_meta,
            p_status: "approved",
          });
          continue;
        }

        if (estado === "PENDING" && suyo === nuestro) {
          pasos.push({
            clave: `plantilla-${p.en_meta}`,
            titulo: p.nombre,
            ok: true,
            detalle: "Ya está en Meta esperando aprobación. No hace falta tocarla.",
          });
          continue;
        }

        // Rechazada, o el texto de acá cambió. En los dos casos hay que
        // reemplazarla: dejar una que no coincide es peor que no tener
        // ninguna, porque Meta acepta el envío y manda los datos corridos.
        const borrada = await borrarPlantilla(c.waba_id, c.access_token, p.en_meta);
        if (!borrada) {
          pasos.push({
            clave: `plantilla-${p.en_meta}`,
            titulo: p.nombre,
            ok: false,
            detalle:
              `Está en Meta como «${estado.toLowerCase()}» y no se pudo borrar para reemplazarla. ` +
              "Borrala a mano en WhatsApp Manager y volvé a tocar este botón.",
          });
          continue;
        }
      }

      // Borrar una plantilla no es inmediato del lado de Meta: tarda hasta
      // un minuto en propagarse, y mientras tanto rechaza crear otra con el
      // mismo nombre. Lo dice él mismo en el error, así que se espera y se
      // reintenta en vez de devolver una falla que no es una falla.
      let paso = await crearPlantilla(c.waba_id, c.access_token, p);

      for (let intento = 0; intento < 4 && !paso.ok; intento += 1) {
        if (!borradoEnCurso(paso.detalle)) break;
        await dormir(12000);
        paso = await crearPlantilla(c.waba_id, c.access_token, p);
      }

      if (!paso.ok && borradoEnCurso(paso.detalle)) {
        paso = {
          ...paso,
          detalle:
            "Meta todavía está borrando la plantilla anterior. Esperá un minuto y volvé a tocar este botón.",
        };
      }

      pasos.push(paso);
      if (paso.ok) {
        await supabase.rpc("rpc_mark_template_status", {
          p_tenant: tenantId,
          p_provider_name: p.en_meta,
          p_status: "pending",
        });
      }
    }

    return Response.json({ pasos });
  }

  // ---------------------------------------------------------------------
  // 1. ¿El token sirve y el número existe?
  // ---------------------------------------------------------------------
  const numero = await preguntar(
    `https://graph.facebook.com/${GRAPH}/${c.phone_number_id}` +
      `?fields=display_phone_number,verified_name,quality_rating,platform_type`,
    c.access_token,
  );

  pasos.push({
    clave: "numero",
    titulo: "El token sirve y el número responde",
    ok: numero.ok,
    detalle: numero.ok
      ? `Es el ${numero.datos.display_phone_number ?? "número conectado"}` +
        (numero.datos.verified_name ? `, a nombre de ${numero.datos.verified_name}` : "") +
        "."
      : numero.detalle,
  });

  // ---------------------------------------------------------------------
  // 2. ¿Están las plantillas, con el nombre exacto y aprobadas?
  // ---------------------------------------------------------------------
  if (numero.ok && c.waba_id) {
    const lista = await preguntar(
      `https://graph.facebook.com/${GRAPH}/${c.waba_id}/message_templates` +
        `?fields=name,status,language&limit=200`,
      c.access_token,
    );

    if (!lista.ok) {
      pasos.push({
        clave: "plantillas",
        titulo: "Las plantillas están aprobadas",
        ok: false,
        detalle: lista.detalle,
      });
    } else {
      const enMeta = (lista.datos.data ?? []) as Array<{
        name: string;
        status: string;
        language: string;
      }>;

      const faltan: string[] = [];
      const sinAprobar: string[] = [];

      for (const t of c.templates ?? []) {
        const encontrada = enMeta.find((m) => m.name === t.en_meta);
        if (!encontrada) faltan.push(t.en_meta);
        else if (encontrada.status !== "APPROVED") {
          sinAprobar.push(`${t.en_meta} (${encontrada.status.toLowerCase()})`);
        }
      }

      const total = c.templates?.length ?? 0;
      let detalle: string;

      if (faltan.length === 0 && sinAprobar.length === 0) {
        detalle = `Las ${total} plantillas están cargadas y aprobadas.`;
      } else if (faltan.length === total && sinAprobar.length === 0) {
        // No falta un nombre: no hay ninguna. Decirle «revisá que el nombre
        // sea idéntico» manda a buscar una diferencia que no existe, y a
        // dudar de lo que ya está bien.
        detalle =
          "Todavía no están creadas en Meta. Tocá «Crear las plantillas en Meta» acá abajo y volvé a revisar.";
      } else {
        const problemas = [
          faltan.length > 0
            ? `faltan crear en Meta: ${faltan.join(", ")}`
            : "",
          sinAprobar.length > 0
            ? `todavía sin aprobar: ${sinAprobar.join(", ")}`
            : "",
        ].filter(Boolean);
        detalle = `${problemas.join("; ")}. Si alguna dice que falta y vos la ves en Meta, el nombre no coincide: tiene que ser idéntico, guiones bajos incluidos.`;
      }

      pasos.push({
        clave: "plantillas",
        titulo: "Las plantillas están aprobadas",
        ok: faltan.length === 0 && sinAprobar.length === 0,
        detalle,
      });
    }
  } else if (numero.ok) {
    pasos.push({
      clave: "plantillas",
      titulo: "Las plantillas están aprobadas",
      ok: false,
      detalle:
        "Falta el identificador de la cuenta de WhatsApp (WABA) para poder revisarlas.",
    });
  }

  // ---------------------------------------------------------------------
  // 3. ¿Llega un mensaje de verdad?
  // ---------------------------------------------------------------------
  if (destino && numero.ok) {
    const soloDigitos = destino.replace(/\D/g, "");
    const plantilla = (c.templates ?? [])[0];

    if (!plantilla) {
      pasos.push({
        clave: "envio",
        titulo: "Llega un mensaje de prueba",
        ok: false,
        detalle: "No hay ninguna plantilla de WhatsApp cargada para probar.",
      });
    } else {
      try {
        const r = await fetch(
          `https://graph.facebook.com/${GRAPH}/${c.phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${c.access_token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: soloDigitos,
              type: "template",
              template: {
                name: plantilla.en_meta,
                language: { code: plantilla.idioma },
              },
            }),
          },
        );
        const datos = (await r.json()) as Record<string, unknown>;

        if (r.ok) {
          pasos.push({
            clave: "envio",
            titulo: "Llega un mensaje de prueba",
            ok: true,
            detalle:
              "Meta lo aceptó. Si no aparece en el teléfono en un minuto, el problema está del lado de WhatsApp y no del sistema.",
          });
        } else {
          const err = datos.error as
            | { code?: number; message?: string }
            | undefined;
          pasos.push({
            clave: "envio",
            titulo: "Llega un mensaje de prueba",
            ok: false,
            detalle: traducir(err),
          });
        }
      } catch (e) {
        pasos.push({
          clave: "envio",
          titulo: "Llega un mensaje de prueba",
          ok: false,
          detalle: `No se pudo hablar con Meta: ${
            e instanceof Error ? e.message : String(e)
          }`,
        });
      }
    }
  }

  return Response.json({ pasos });
});
