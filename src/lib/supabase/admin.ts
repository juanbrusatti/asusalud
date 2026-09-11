import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Cliente con `service_role`: SE SALTEA TODA LA RLS.
 *
 * Reglas de uso, sin excepciones:
 *   · Nunca se importa desde un componente de cliente. El `server-only` de
 *     arriba hace que el build falle si alguien lo intenta.
 *   · Sólo para trabajos del sistema: colas de envío, webhooks firmados,
 *     importaciones y tareas programadas.
 *   · Jamás para "resolver" un problema de permisos. Si una consulta no
 *     devuelve lo que debería, la política está mal y se arregla la política.
 */
export function createAdminClient() {
  const env = serverEnv();

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no está configurada. Sólo hace falta para " +
        "tareas del sistema; no la agregues para sortear la RLS.",
    );
  }

  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
