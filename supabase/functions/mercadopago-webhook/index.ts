import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Webhook de Mercado Pago.
 *
 * Avisa cuando un pago cambia de estado. Lo que llega es apenas un
 * identificador, así que el aviso no se cree: se le pregunta a Mercado Pago
 * por ese pago con NUESTRA clave, y se cree lo que conteste.
 *
 * Eso es lo que hace que no haga falta verificar la firma para estar seguros.
 * Alguien que invente un aviso sólo consigue que le preguntemos a Mercado Pago
 * por un pago que no existe, o que no es nuestro —con nuestra clave sólo vemos
 * los nuestros—. Para que marquemos un mes como pagado tiene que haber, de
 * verdad, un pago aprobado en nuestra cuenta con ese negocio y ese mes. Y eso
 * se consigue de una sola forma: pagando.
 *
 * Se responde 200 siempre y rápido. Mercado Pago reintenta lo que no contesta
 * a tiempo, y un reintento no tiene que costar nada: la base ya sabe que un
 * pago que ya procesó no se procesa dos veces.
 */

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";

type Aviso = {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  resource?: string;
};

/** El identificador del pago, en cualquiera de las formas que manda Mercado Pago. */
function idDelPago(aviso: Aviso): string | null {
  const tipo = aviso.type ?? aviso.topic ?? "";
  if (!tipo.startsWith("payment")) return null;

  if (aviso.data?.id != null) return String(aviso.data.id);

  // La forma vieja manda la dirección completa del recurso.
  if (aviso.resource) {
    const ultimo = aviso.resource.split("/").pop();
    if (ultimo && /^\d+$/.test(ultimo)) return ultimo;
  }

  return null;
}

async function procesar(pago: string): Promise<void> {
  if (!TOKEN) {
    console.error("mercadopago-webhook: falta MERCADOPAGO_ACCESS_TOKEN");
    return;
  }

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${pago}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (!r.ok) {
    // Un pago que no es nuestro da 404 acá, que es exactamente la defensa.
    console.error(`mercadopago-webhook: pago ${pago} → HTTP ${r.status}`);
    return;
  }

  const datos = (await r.json()) as {
    status?: string;
    external_reference?: string | null;
    transaction_amount?: number | null;
  };

  if (datos.status !== "approved") {
    console.log(`mercadopago-webhook: pago ${pago} está ${datos.status}`);
    return;
  }

  // Lo que entró, en centavos. Va aparte de lo que esperábamos cobrar: si
  // alguien paga un cobro viejo por otro importe, el mes tiene que quedar
  // registrado por lo que se pagó de verdad, con la diferencia anotada.
  const entraron =
    typeof datos.transaction_amount === "number"
      ? Math.round(datos.transaction_amount * 100)
      : null;

  const { data, error } = await supabase.rpc("rpc_mercadopago_paid", {
    p_external_reference: datos.external_reference ?? null,
    p_payment_id: pago,
    p_paid_cents: entraron,
  });

  if (error) {
    console.error(`mercadopago-webhook: ${error.message}`);
    return;
  }

  const res = data as { ok: boolean; error?: string; repetido?: boolean };
  if (!res?.ok) {
    console.error(`mercadopago-webhook: pago ${pago} → ${res?.error}`);
  } else if (!res.repetido) {
    console.log(`mercadopago-webhook: cobrado el pago ${pago}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  let aviso: Aviso;
  try {
    aviso = (await req.json()) as Aviso;
  } catch {
    return new Response("ok", { status: 200 });
  }

  const pago = idDelPago(aviso);

  // Se contesta primero y se procesa después: si esto tarda, Mercado Pago da
  // el aviso por perdido y lo reintenta.
  if (pago) {
    queueMicrotask(() => {
      procesar(pago).catch((e) => console.error("mercadopago-webhook:", e));
    });
  }

  return new Response("ok", { status: 200 });
});
