import { createClient } from "jsr:@supabase/supabase-js@2";
import { send, type Job } from "../_shared/channels.ts";

/**
 * El emisor.
 *
 * Lo llama pg_cron cada minuto. Toma los envíos vencidos, arma el mensaje y lo
 * entrega por el canal que el motor eligió.
 *
 * Va deliberadamente despacio. Meta permite ochenta mensajes por segundo, pero
 * doscientos recordatorios que salen en ráfaga son exactamente el patrón que
 * termina en bloqueo. Salen de a uno, con una pausa irregular entre medio: se
 * parece a una persona trabajando y no a una máquina vaciando una lista.
 */

const LOTE = Number(Deno.env.get("DISPATCH_BATCH") ?? 20);
const PAUSA_MIN_MS = Number(Deno.env.get("DISPATCH_MIN_MS") ?? 1500);
const PAUSA_MAX_MS = Number(Deno.env.get("DISPATCH_MAX_MS") ?? 4000);

function pausa(): Promise<void> {
  const ms = PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS);
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  // Sólo lo llama el reloj de la base. Sin este secreto, cualquiera podría
  // forzar el vaciado de la cola desde afuera.
  const secret = Deno.env.get("DISPATCH_SECRET");
  if (secret && req.headers.get("x-dlay-secret") !== secret) {
    return new Response("no autorizado", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Los envoltorios rpc_* viven en `public` porque la API no expone el esquema
  // `app`, y sólo `service_role` los puede ejecutar.
  const { data: claimed, error: claimError } = await supabase.rpc(
    "rpc_claim_due_jobs",
    { p_limit: LOTE },
  );

  if (claimError) {
    return Response.json({ error: claimError.message }, { status: 500 });
  }

  const ids = (claimed ?? []).map((j: { id: string }) => j.id);
  if (ids.length === 0) {
    return Response.json({ tomados: 0, enviados: 0, fallados: 0 });
  }

  const { data: payloads, error: payloadError } = await supabase.rpc(
    "rpc_jobs_payload",
    { p_ids: ids },
  );

  if (payloadError) {
    return Response.json({ error: payloadError.message }, { status: 500 });
  }

  let enviados = 0;
  let fallados = 0;

  for (const job of (payloads ?? []) as Job[]) {
    let result;
    try {
      result = await send(job);
    } catch (err) {
      // Una excepción suele ser de red: se reintenta.
      result = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        wasTest: job.test_mode,
        permanent: false,
      };
    }

    await supabase.rpc("rpc_finish_job", {
      p_id: job.job_id,
      p_ok: result.ok,
      p_subject: result.subject ?? null,
      p_body: result.body ?? null,
      p_provider_id: result.providerId ?? null,
      p_error: result.error ?? null,
      p_was_test: result.wasTest,
      p_permanent: result.permanent ?? false,
    });

    if (result.ok) enviados += 1;
    else fallados += 1;

    // En modo de prueba no hay nadie del otro lado a quien cuidar.
    if (!job.test_mode) await pausa();
  }

  return Response.json({ tomados: ids.length, enviados, fallados });
});
