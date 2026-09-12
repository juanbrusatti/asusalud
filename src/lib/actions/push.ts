"use server";

import { revalidatePath } from "next/cache";
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

  if (error) return { error: "No pudimos activar las notificaciones." };

  revalidatePath("/");
  return { error: null };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  await supabase.rpc("unregister_push_subscription", { p_endpoint: endpoint });
  revalidatePath("/");
  return { error: null };
}
