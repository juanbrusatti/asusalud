import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Webhook de WhatsApp.
 *
 * Meta avisa acá tres cosas: si un mensaje llegó y lo leyeron, qué contestó la
 * clienta, y cómo viene la salud del número.
 *
 * Dos reglas que no se negocian:
 *
 *   1. SE VERIFICA LA FIRMA. Sin eso, cualquiera que conozca la URL puede
 *      inventar estados de entrega, dar de baja clientas o confirmar turnos
 *      ajenos. Se compara con el app_secret de la estética a la que llega.
 *   2. SE RESPONDE 200 RÁPIDO. Meta reintenta lo que no contesta a tiempo, y
 *      un reintento que se procesa de nuevo puede ejecutar dos veces la misma
 *      acción. El procesamiento va después de responder.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** HMAC SHA-256 del cuerpo crudo, comparado en tiempo constante. */
async function signatureMatches(
  raw: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw),
  );
  const esperado = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const recibido = header.slice("sha256=".length);
  if (recibido.length !== esperado.length) return false;

  // Comparación de tiempo constante: salir antes ante la primera diferencia
  // filtra información sobre la firma correcta.
  let diff = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diff |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  }
  return diff === 0;
}

/** El identificador del número al que le llegó el aviso. */
function phoneNumberIdOf(payload: unknown): string | null {
  const entry = (payload as { entry?: unknown[] })?.entry?.[0] as
    | { changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }
    | undefined;
  return entry?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
}

const GRAPH_VERSION = "v21.0";

type Respuesta = {
  a: string;
  texto: string;
  phone_number_id: string;
  access_token: string | null;
};

/**
 * Le contesta a quien acaba de apretar un botón.
 *
 * Apretar un botón abre una ventana de veinticuatro horas, así que esto es un
 * mensaje de servicio: se puede mandar texto libre y no cuesta lo que cuesta
 * iniciar una conversación.
 *
 * Sin esta respuesta, el cliente aprieta «Confirmar» y no pasa nada visible de
 * su lado. Entonces vuelve a apretar, o escribe preguntando si llegó, que es
 * justo el mensaje que el recordatorio venía a evitar.
 *
 * Si falla, no se reintenta ni se rompe nada: la acción de fondo —confirmar,
 * cancelar— ya quedó hecha, que es lo que importa.
 */
async function contestar(r: Respuesta | undefined): Promise<void> {
  if (!r?.texto || !r.access_token) return;

  try {
    await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${r.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${r.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: r.a,
          type: "text",
          text: { body: r.texto, preview_url: true },
        }),
      },
    );
  } catch {
    // Que no se pueda contestar no invalida lo que ya se hizo.
  }
}

async function process(payload: Record<string, unknown>): Promise<void> {
  const entries = (payload.entry ?? []) as Array<{
    changes?: Array<{ field?: string; value?: Record<string, unknown> }>;
  }>;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId =
        (value.metadata as { phone_number_id?: string } | undefined)
          ?.phone_number_id ?? null;

      // Estados de entrega.
      for (const st of (value.statuses ?? []) as Array<Record<string, unknown>>) {
        const errors = st.errors as Array<{ title?: string; message?: string }> | undefined;
        await supabase.rpc("rpc_record_delivery", {
          p_provider_id: st.id as string,
          p_status: st.status as string,
          p_error: errors?.[0]?.title ?? errors?.[0]?.message ?? null,
        });
      }

      // Respuestas de las clientas.
      for (const msg of (value.messages ?? []) as Array<Record<string, unknown>>) {
        if (!phoneNumberId) continue;

        const kind = (msg.type as string) ?? "unknown";
        const text = (msg.text as { body?: string } | undefined)?.body ?? null;
        // Un botón de plantilla llega como `button`; uno interactivo, como
        // `interactive.button_reply`.
        const payloadBoton =
          (msg.button as { payload?: string } | undefined)?.payload ??
          (
            (msg.interactive as
              | { button_reply?: { id?: string } }
              | undefined)?.button_reply?.id
          ) ??
          null;

        const { data: resultado } = await supabase.rpc("rpc_handle_inbound", {
          p_phone_number_id: phoneNumberId,
          p_wa_message_id: msg.id as string,
          p_from: msg.from as string,
          p_kind: kind,
          p_body: text,
          p_payload: payloadBoton,
        });

        await contestar(
          (resultado as { responder?: Respuesta } | null)?.responder,
        );
      }

      // Salud del número.
      if (change.field === "account_update" || value.event) {
        await supabase.rpc("rpc_record_account_health", {
          p_phone_number_id: phoneNumberId,
          p_quality:
            (value.current_limit as string | undefined) === undefined
              ? ((value.quality_rating as string) ?? null)
              : ((value.quality_rating as string) ?? null),
          p_limit: (value.current_limit as string) ?? null,
          p_status:
            value.event === "DISABLED_UPDATE"
              ? "disabled"
              : value.event === "ACCOUNT_RESTRICTION"
                ? "restricted"
                : null,
        });
      }

      if (change.field === "message_template_quality_update") {
        // La calidad de una plantilla puntual: se refleja para no seguir
        // usando una que Meta ya pausó.
        await supabase
          .from("message_templates")
          .update({
            provider_status:
              (value.new_quality_score as string) === "RED" ? "paused" : "approved",
          })
          .eq("provider_name", value.message_template_name as string);
      }
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handshake de alta: Meta pide confirmar que la URL es nuestra.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !token) {
      return new Response("no", { status: 400 });
    }

    const { data } = await supabase
      .from("whatsapp_accounts")
      .select("verify_token")
      .eq("verify_token", token)
      .maybeSingle();

    return data
      ? new Response(challenge ?? "", { status: 200 })
      : new Response("token inválido", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("método no permitido", { status: 405 });
  }

  // El cuerpo CRUDO: volver a serializar el JSON cambiaría los bytes y la
  // firma no daría.
  const raw = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("json inválido", { status: 400 });
  }

  const phoneNumberId = phoneNumberIdOf(payload);
  if (!phoneNumberId) {
    // Nada que hacer, pero se responde bien para que Meta no reintente.
    return new Response("ok", { status: 200 });
  }

  const { data: secrets } = await supabase.rpc("rpc_webhook_secrets", {
    p_phone_number_id: phoneNumberId,
  });
  const appSecret = secrets?.[0]?.app_secret as string | undefined;

  if (!appSecret) {
    return new Response("cuenta desconocida", { status: 404 });
  }

  if (
    !(await signatureMatches(raw, req.headers.get("x-hub-signature-256"), appSecret))
  ) {
    return new Response("firma inválida", { status: 401 });
  }

  // Se responde primero y se procesa después: Meta reintenta lo que tarda.
  const done = process(payload).catch((err) => {
    console.error("error procesando webhook:", err);
  });

  // @ts-ignore EdgeRuntime lo provee Supabase en producción.
  if (typeof EdgeRuntime !== "undefined") {
    // @ts-ignore
    EdgeRuntime.waitUntil(done);
  } else {
    await done;
  }

  return new Response("ok", { status: 200 });
});
