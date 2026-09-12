import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ManageView } from "@/lib/autogestion";

export type { ManageBlock, ManageStatus, ManageView } from "@/lib/autogestion";
export { blockMessage, nextDays } from "@/lib/autogestion";

/**
 * El turno detrás de un enlace.
 *
 * Igual que la reserva pública: ni una tabla: sólo la función que devuelve lo
 * justo para manejar ese turno. El nombre de pila viaja para que quien abre el
 * enlace reconozca que es el suyo; el resto de la ficha, no.
 */
export async function getManageView(
  token: string,
): Promise<ManageView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("booking_manage", {
    p_token: token,
  });

  if (error || !data) return null;

  const parsed = data as unknown as { ok: boolean } & ManageView;
  return parsed.ok ? parsed : null;
}
