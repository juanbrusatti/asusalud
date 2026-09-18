import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { armarCsv, respuestaCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";

/**
 * La libreta de clientes, en un archivo.
 *
 * Existe por dos razones y las dos importan. Los términos prometen treinta
 * días para llevarse los datos, y una promesa que el sistema no puede cumplir
 * es peor que no haberla hecho. Y porque le vendemos a negocios que acaban de
 * irse de otro sistema: el día que pregunten «¿y si me quiero ir?», la
 * respuesta tiene que ser un botón.
 *
 * Lo pide la base con la sesión de quien navega, así que la RLS decide qué
 * fichas salen. Nadie se lleva las de otro negocio.
 */
export async function GET() {
  const membership = await getCurrentTenant();
  if (!membership) return new Response("No encontramos tu negocio.", { status: 404 });

  // La libreta entera es justamente lo que no ve quien atiende.
  if (!atLeast(membership.role, "reception")) {
    return new Response("No tenés permiso para esto.", { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(
      "first_name, last_name, phone_e164, email, document_id, birthdate, alert, is_active, created_at",
    )
    .order("first_name");

  if (error) return new Response("No se pudo leer.", { status: 500 });

  const csv = armarCsv(
    [
      "Nombre",
      "Apellido",
      "Teléfono",
      "Correo",
      "Documento",
      "Nacimiento",
      "Aviso",
      "Activa",
      "Dada de alta",
    ],
    (data ?? []).map((c) => [
      c.first_name,
      c.last_name,
      c.phone_e164,
      c.email,
      c.document_id,
      c.birthdate,
      c.alert,
      c.is_active ? "sí" : "no",
      new Date(c.created_at).toLocaleDateString("es-AR"),
    ]),
  );

  const hoy = new Date().toISOString().slice(0, 10);
  return respuestaCsv(`clientes-${membership.tenant.slug}-${hoy}.csv`, csv);
}
