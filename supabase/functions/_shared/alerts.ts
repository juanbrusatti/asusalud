import { pushToTargets, vapidReady, type PushTarget } from "./channels.ts";

/**
 * Avisos al equipo.
 *
 * Van por separado de los recordatorios y con otras reglas, porque son otra
 * cosa: no tienen regla que los programe, ni plantilla, ni costo, ni franja
 * horaria que respetar. Una reserva que entra a las once de la noche se avisa
 * a las once de la noche; para eso el equipo activó las notificaciones.
 *
 * Tampoco se manda de a uno con pausa como los WhatsApp: son notificaciones a
 * los teléfonos del propio equipo, no mensajes que puedan hacer que a alguien
 * le bloqueen la cuenta.
 */

export type TeamAlert = {
  id: string;
  tenant_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  tag: string | null;
  attempts: number;
};

export async function drainTeamAlerts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  limit: number,
): Promise<{ tomados: number; enviados: number; fallados: number }> {
  const vacio = { tomados: 0, enviados: 0, fallados: 0 };

  const { data: alerts } = await supabase.rpc("rpc_claim_team_alerts", {
    p_limit: limit,
  });

  const pendientes = (alerts ?? []) as TeamAlert[];
  if (pendientes.length === 0) return vacio;

  // Sin claves no hay nada que hacer, pero los avisos ya fueron tomados: hay
  // que cerrarlos con el motivo o quedan dando vueltas hasta agotar intentos
  // sin que nadie sepa por qué.
  if (!vapidReady()) {
    for (const a of pendientes) {
      await supabase.rpc("rpc_finish_team_alert", {
        p_id: a.id,
        p_ok: false,
        p_error: "Faltan las claves de notificaciones en el servidor.",
      });
    }
    return { tomados: pendientes.length, enviados: 0, fallados: pendientes.length };
  }

  // Las suscripciones se piden una vez por estética y no una por aviso: tres
  // reservas seguidas de la misma estética son tres avisos y una consulta.
  const porEstetica = new Map<string, PushTarget[]>();
  let enviados = 0;
  let fallados = 0;

  for (const alerta of pendientes) {
    let destinos = porEstetica.get(alerta.tenant_id);

    if (!destinos) {
      const { data } = await supabase.rpc("rpc_team_push_targets", {
        p_tenant: alerta.tenant_id,
      });
      destinos = (data ?? []) as PushTarget[];
      porEstetica.set(alerta.tenant_id, destinos);
    }

    if (destinos.length === 0) {
      await supabase.rpc("rpc_finish_team_alert", {
        p_id: alerta.id,
        p_ok: false,
        p_error: "Nadie del equipo tiene las notificaciones activadas.",
      });
      fallados += 1;
      continue;
    }

    const { delivered, lastError } = await pushToTargets(
      supabase,
      destinos,
      JSON.stringify({
        title: alerta.title,
        body: alerta.body,
        url: alerta.url ?? "/agenda",
        tag: alerta.tag ?? undefined,
      }),
    );

    // Alcanza con que llegue a un dispositivo: el equipo comparte la
    // información, no hace falta que suene en todos.
    await supabase.rpc("rpc_finish_team_alert", {
      p_id: alerta.id,
      p_ok: delivered > 0,
      p_error: delivered > 0 ? null : lastError,
    });

    if (delivered > 0) enviados += 1;
    else fallados += 1;
  }

  return { tomados: pendientes.length, enviados, fallados };
}
