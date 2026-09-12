import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Report } from "@/lib/informes";

export type { Range, Report } from "@/lib/informes";
export {
  CHANNEL_LABELS,
  PRESETS,
  PRESET_LABELS,
  describeRange,
  resolveRange,
  share,
} from "@/lib/informes";

/**
 * El informe de un período.
 *
 * La base devuelve todo junto en un jsonb: son seis preguntas sobre las mismas
 * fechas y conviene que las conteste de una sola lectura, para que los números
 * de la pantalla sean coherentes entre sí aunque alguien cobre en el medio.
 */
export async function getReport(
  from: string,
  to: string,
): Promise<Report | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_period", {
    p_from: from,
    p_to: to,
  });

  if (error) throw error;
  return (data as unknown as Report) ?? null;
}
