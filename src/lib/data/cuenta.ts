import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Cartel, Cuenta, NegocioPlataforma } from "@/lib/cuenta";

/**
 * Lo que Dlay le cobra a cada negocio.
 *
 * Nada de esto se guarda como un total: se calcula sobre los turnos cada vez
 * que alguien pregunta. Lo único guardado es el pago, y ese sí congela el
 * precio del mes que cobró.
 */

export async function getCuenta(): Promise<Cuenta | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_summary");
  if (error) return null;
  return (data as unknown as Cuenta | null) ?? null;
}

/**
 * Todos los negocios, para el panel de Dlay.
 *
 * Devuelve null cuando quien pregunta no es de la plataforma. No hace falta
 * preguntarlo aparte: la función de la base ya rechaza a quien no corresponde,
 * y esa es la única comprobación que vale — la de la pantalla es comodidad.
 */
export async function getNegocios(): Promise<NegocioPlataforma[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_accounts");
  if (error) return null;
  return (data as unknown as NegocioPlataforma[]) ?? [];
}

/**
 * El cartel de «pagá la cuenta», si Dlay lo levantó.
 *
 * Devuelve null cuando no hay nada que mostrar, y también cuando quien
 * pregunta no dirige el negocio: la factura no es asunto de quien atiende, y
 * tampoco que exista.
 */
export async function getCartel(): Promise<Cartel | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("billing_nudge");
  if (error) return null;
  return (data as unknown as Cartel | null) ?? null;
}
