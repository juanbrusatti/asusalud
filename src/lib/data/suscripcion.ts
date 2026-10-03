import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Suscripcion } from "@/lib/suscripcion";

/**
 * El estado de la suscripción del negocio.
 *
 * Memorizado por render: lo piden el marco —para el aviso y el muro— y la
 * pantalla de la cuenta en la misma navegación, y no tiene por qué costar dos
 * viajes.
 */
export const getSuscripcion = cache(
  async (tenantId: string): Promise<Suscripcion | null> => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("suscripcion_estado", {
      p_tenant: tenantId,
    });
    return (data as Suscripcion | null) ?? null;
  },
);
