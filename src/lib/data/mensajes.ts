import "server-only";

import { createClient } from "@/lib/supabase/server";

export type Conversacion = {
  telefono: string;
  client_id: string | null;
  nombre: string | null;
  ultimo_texto: string | null;
  ultimo_entrante: boolean;
  ultimo_at: string;
  ventana_hasta: string | null;
  sin_responder: boolean;
};

export type Mensaje = {
  entrante: boolean;
  body: string | null;
  payload: string | null;
  cuando: string;
  sent_by: string | null;
};

export async function getConversaciones(
  tenantId: string,
): Promise<Conversacion[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("whatsapp_conversaciones", {
    p_tenant: tenantId,
  });
  return (data ?? []) as Conversacion[];
}

export async function getConversacion(
  tenantId: string,
  telefono: string,
): Promise<Mensaje[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("whatsapp_conversacion", {
    p_tenant: tenantId,
    p_telefono: telefono,
  });
  return (data ?? []) as Mensaje[];
}

/** Cuánto queda de la ventana de Meta, en minutos. Negativo si ya cerró. */
export function minutosDeVentana(hasta: string | null): number | null {
  if (!hasta) return null;
  return Math.round((new Date(hasta).getTime() - Date.now()) / 60000);
}

/**
 * La ventana en palabras.
 *
 * Es el dato que decide si se puede escribir o no, así que se dice entero y
 * no con un reloj de colores: «te quedan 6 h» se entiende sin aprender nada.
 */
export function ventanaEnPalabras(hasta: string | null): string {
  const minutos = minutosDeVentana(hasta);
  if (minutos === null) return "Todavía no te escribió";
  if (minutos <= 0) return "Cerrada: sólo podés escribirle si ella escribe";
  if (minutos < 60) return `Te quedan ${minutos} min para contestarle`;
  const horas = Math.floor(minutos / 60);
  return `Te quedan ${horas} h para contestarle`;
}
