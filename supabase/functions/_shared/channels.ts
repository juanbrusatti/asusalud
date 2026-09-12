import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { render, templateParameters, type RenderContext } from "./render.ts";

export type Job = {
  job_id: string;
  tenant_id: string;
  channel: "push" | "email" | "whatsapp";
  test_mode: boolean;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  template_subject: string | null;
  template_body: string | null;
  provider_name: string | null;
  provider_language: string | null;
  quick_replies: string[] | null;
  appointment_id: string | null;
  client_id: string;
  tenant_name: string;
  tenant_timezone: string;
  appointment_at: string | null;
  service_names: string | null;
  phone_number_id: string | null;
  access_token: string | null;
};

export type SendResult = {
  ok: boolean;
  providerId?: string;
  error?: string;
  subject?: string;
  body?: string;
  wasTest: boolean;
  /**
   * True cuando reintentar no va a cambiar nada: falta un dato de la ficha o
   * una configuración de la estética. Estos van directo a "falló" con el
   * motivo escrito para que alguien lo resuelva.
   */
  permanent?: boolean;
};

/** Cliente del sistema, sólo para buscar las suscripciones de una persona. */
function createSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function contextOf(job: Job): RenderContext {
  return {
    clientName: job.client_name,
    tenantName: job.tenant_name,
    tenantTimezone: job.tenant_timezone,
    appointmentAt: job.appointment_at,
    serviceNames: job.service_names,
  };
}

/**
 * Entrega un mensaje por el canal que le corresponde.
 *
 * En modo de prueba se hace todo el recorrido —se arma el texto, se valida que
 * haya destinatario y credenciales— pero no sale nada. Es lo que permite mirar
 * una semana entera de recordatorios antes de que lleguen a alguien de verdad.
 */
export async function send(job: Job): Promise<SendResult> {
  if (!job.template_body) {
    return {
      ok: false,
      error: "La regla no tiene un mensaje cargado para este canal.",
      wasTest: job.test_mode,
      permanent: true,
    };
  }

  const ctx = contextOf(job);
  const body = render(job.template_body, ctx);
  const subject = job.template_subject
    ? render(job.template_subject, ctx)
    : undefined;

  if (job.test_mode) {
    // Se valida igual todo lo que haría falta para enviar de verdad: así el
    // modo de prueba sirve para detectar problemas, no sólo para no molestar.
    const problema = validate(job);
    return problema
      ? {
          ok: false,
          error: `${problema} (detectado en modo de prueba)`,
          wasTest: true,
          permanent: true,
        }
      : { ok: true, providerId: "prueba", subject, body, wasTest: true };
  }

  switch (job.channel) {
    case "email":
      return await sendEmail(job, subject, body);
    case "whatsapp":
      return await sendWhatsApp(job, ctx, body);
    case "push":
      return await sendPush(job, subject, body);
  }
}

/** Qué falta para poder enviar. Null si está todo. */
function validate(job: Job): string | null {
  if (job.channel === "email" && !job.client_email) {
    return "La ficha no tiene correo.";
  }
  if (job.channel === "push" && !Deno.env.get("VAPID_PRIVATE_KEY")) {
    return "Faltan configurar las claves de notificaciones en el servidor.";
  }
  if (job.channel === "whatsapp") {
    if (!job.client_phone) return "La ficha no tiene teléfono.";
    if (!job.phone_number_id || !job.access_token) {
      return "La estética todavía no conectó su cuenta de WhatsApp.";
    }
    if (!job.provider_name) {
      return "El mensaje no tiene el nombre con el que Meta lo aprobó.";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Correo · Brevo
// ---------------------------------------------------------------------------
async function sendEmail(
  job: Job,
  subject: string | undefined,
  body: string,
): Promise<SendResult> {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const fromEmail = Deno.env.get("MAIL_FROM") ?? "turnos@dlay.app";

  if (!job.client_email) {
    return {
      ok: false,
      error: "La ficha no tiene correo.",
      wasTest: false,
      permanent: true,
    };
  }
  if (!apiKey) {
    return {
      ok: false,
      error: "Falta configurar BREVO_API_KEY en el servidor.",
      wasTest: false,
      permanent: true,
    };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      // El nombre que se ve es el de la estética, no el nuestro: la clienta
      // conoce a Asusalud, no a Dlay.
      sender: { name: job.tenant_name, email: fromEmail },
      to: [{ email: job.client_email, name: job.client_name }],
      subject: subject ?? `Tu turno en ${job.tenant_name}`,
      textContent: body,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      ok: false,
      error: `Brevo respondió ${response.status}: ${detail.slice(0, 200)}`,
      wasTest: false,
      // 4xx es un pedido mal armado o una credencial mala: no se arregla solo.
      permanent: response.status >= 400 && response.status < 500,
    };
  }

  const data = await response.json();
  return {
    ok: true,
    providerId: data.messageId ?? undefined,
    subject,
    body,
    wasTest: false,
  };
}

// ---------------------------------------------------------------------------
// WhatsApp · Cloud API de Meta
// ---------------------------------------------------------------------------
const GRAPH_VERSION = "v21.0";

async function sendWhatsApp(
  job: Job,
  ctx: RenderContext,
  body: string,
): Promise<SendResult> {
  const problema = validate(job);
  if (problema) {
    return { ok: false, error: problema, wasTest: false, permanent: true };
  }

  // Meta no recibe el texto: recibe el nombre de la plantilla aprobada y sus
  // parámetros. El cuerpo que guardamos sirve para saber qué decía y para
  // mostrarlo en la bitácora.
  const parameters = templateParameters(job.template_body!, ctx).map((v) => ({
    type: "text",
    text: v,
  }));

  const components: Array<Record<string, unknown>> = [];
  if (parameters.length > 0) {
    components.push({ type: "body", parameters });
  }

  // Los botones van con el turno adentro del payload: es lo que permite que
  // "Confirmar" actualice la agenda sola cuando vuelve por el webhook.
  (job.quick_replies ?? []).forEach((accion, index) => {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [
        {
          type: "payload",
          payload: job.appointment_id
            ? `${accion}:${job.appointment_id}`
            : accion,
        },
      ],
    });
  });

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${job.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${job.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: job.client_phone,
        type: "template",
        template: {
          name: job.provider_name,
          language: { code: job.provider_language ?? "es_AR" },
          components: components.length > 0 ? components : undefined,
        },
      }),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const meta = data?.error;
    // 131026 y 131047 son del lado de la clienta (número inválido, ventana
    // cerrada): reintentar no cambia nada. 130429 es límite de velocidad y sí
    // conviene volver a intentarlo más tarde.
    const permanentes = [131026, 131047, 131051, 132000, 132001, 132015];
    return {
      ok: false,
      error: `Meta ${response.status} (${meta?.code ?? "?"}): ${
        meta?.error_user_msg ?? meta?.message ?? "sin detalle"
      }`,
      wasTest: false,
      permanent:
        permanentes.includes(meta?.code) ||
        (response.status >= 400 && response.status < 500 && response.status !== 429),
    };
  }

  return {
    ok: true,
    providerId: data?.messages?.[0]?.id,
    body,
    wasTest: false,
  };
}

// ---------------------------------------------------------------------------
// Notificación · Web Push
// ---------------------------------------------------------------------------
/**
 * El canal gratis. Una persona puede tener el sistema instalado en el teléfono
 * y en la computadora, así que se le manda a todas sus suscripciones y alcanza
 * con que una llegue.
 *
 * Las que el navegador ya no reconoce (410 o 404) se borran: son de alguien
 * que desinstaló la aplicación o limpió los datos, y guardarlas ensucia las
 * métricas y hace más lento cada envío.
 */
async function sendPush(
  job: Job,
  subject: string | undefined,
  body: string,
): Promise<SendResult> {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const contacto = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hola@dlay.app";

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      error: "Faltan configurar las claves de notificaciones en el servidor.",
      wasTest: false,
      permanent: true,
    };
  }

  webpush.setVapidDetails(contacto, publicKey, privateKey);

  const supabase = createSupabaseClient();
  const { data: destinos } = await supabase.rpc("rpc_push_targets", {
    p_client: job.client_id,
  });

  if (!destinos || destinos.length === 0) {
    return {
      ok: false,
      error: "Esta persona no tiene la aplicación instalada.",
      wasTest: false,
      permanent: true,
    };
  }

  const payload = JSON.stringify({
    title: subject ?? job.tenant_name,
    body,
    url: "/",
    tag: job.appointment_id ?? undefined,
  });

  let entregadas = 0;
  let ultimoError = "";

  for (const destino of destinos as Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>) {
    try {
      await webpush.sendNotification(
        {
          endpoint: destino.endpoint,
          keys: { p256dh: destino.p256dh, auth: destino.auth },
        },
        payload,
      );
      entregadas += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      ultimoError = `push ${status ?? "?"}`;

      if (status === 404 || status === 410) {
        await supabase.rpc("rpc_drop_push_subscription", {
          p_endpoint: destino.endpoint,
        });
      }
    }
  }

  return entregadas > 0
    ? { ok: true, providerId: `push:${entregadas}`, subject, body, wasTest: false }
    : {
        ok: false,
        error: `No se pudo entregar la notificación (${ultimoError}).`,
        wasTest: false,
        // Si todas las suscripciones estaban muertas ya se borraron: volver a
        // intentar no va a encontrar ninguna.
        permanent: true,
      };
}
