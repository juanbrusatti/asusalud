import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/** Rutas que se pueden ver sin sesión. Todo lo demás pide entrar. */
const PUBLIC_PREFIXES = [
  "/entrar",
  "/auth",
  "/manifest.webmanifest",
  "/sw.js",
  // La reserva online: es la única parte del sistema pensada para gente sin
  // cuenta. Lo que puede ver lo decide la base, no este guardia.
  "/r",
  // El enlace del turno. La llave es el token de la dirección: mandar a
  // iniciar sesión a quien sólo quiere avisar que no puede venir es
  // garantizar que no avise.
  "/t",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refresca la sesión en cada navegación y corta el paso a las rutas privadas.
 *
 * El guardia de acá es comodidad de navegación, no seguridad: quien manda es
 * la RLS. Aunque alguien saltee el middleware, la base no le devuelve nada.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalida el token contra Supabase. getSession() sólo lee la
  // cookie, que el navegador puede haber manipulado: acá no sirve.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("volver", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/entrar") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
