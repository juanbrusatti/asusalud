"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Registro de notificaciones push.
 *
 * La suscripción la arma el navegador; nosotros sólo la guardamos para poder
 * mandarle avisos después. Las claves que vienen adentro son las que permiten
 * cifrar el contenido: sin ellas el servidor de push no entrega nada.
 */
export async function savePushSubscription(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  clientId?: string;
}) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("register_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_user_agent: subscription.userAgent,
    p_client_id: subscription.clientId,
  });

  // El motivo real, no un mensaje genérico: cuando esto falla en un teléfono
  // ajeno no hay forma de mirar ningún registro, y lo único que queda es lo
  // que diga la pantalla.
  if (error) {
    return {
      error: `No pudimos activar las notificaciones (${error.message}).`,
    };
  }

  // A propósito no se revalida nada: en esta pantalla el estado de las
  // notificaciones es del navegador, no del servidor, y revalidar desde una
  // acción que se llama al cargar la página la haría volver a renderizar, que
  // volvería a llamar a la acción.
  return { error: null };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.rpc("unregister_push_subscription", { p_endpoint: endpoint });
  return { error: null };
}
