import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * La puerta de los enlaces de un solo uso.
 *
 * Por acá entran las dos formas en que Supabase devuelve a alguien a la
 * aplicación: el `code` de un pedido hecho desde el navegador, y el
 * `token_hash` de un enlace generado del lado del servidor —el que arma Dlay
 * cuando alguien pide que le cambien la contraseña y se lo manda por WhatsApp.
 *
 * Termina en `/cambiar-clave` con la sesión abierta. Es una sesión real, así
 * que el enlace hay que tratarlo como una llave: quien lo tenga entra.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/cambiar-clave";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Un enlace vencido, ya usado o adulterado termina acá. No se dice cuál de
  // las tres: no hay nada que ganar contándoselo a quien lo esté probando.
  return NextResponse.redirect(`${origin}/entrar?enlace=vencido`);
}
