import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/** Rutas que se pueden ver sin sesión. Todo lo demás pide entrar. */
const PUBLIC_PREFIXES = [
  // La portada. Es la única entrada de la lista que no lleva nada debajo: el
  // `isPublic` de abajo compara igualdad exacta o prefijo con barra, así que
  // "/" abre la portada y no el resto del sistema.
  "/",
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
  // Los textos legales. Los tiene que poder abrir cualquiera sin cuenta:
  // los lee quien evalúa en Meta y quien quiere saber qué guardamos
  // antes de decidir si nos confía sus datos.
  "/legal",
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
  const { pathname } = request.nextUrl;

  /**
   * Una página pública sin ninguna cookie de sesión no necesita nada de esto:
   * no hay sesión que refrescar ni permiso que chequear. Es el caso de quien
   * abre el enlace de su turno o la reserva online, que además es quien peor
   * conexión suele tener.
   */
  const traeSesion = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  if (!traeSesion && isPublic(pathname)) {
    return NextResponse.next({ request });
  }

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

  /**
   * `getClaims()` verifica la firma del token CON LA CLAVE PÚBLICA DEL
   * PROYECTO, acá mismo, sin preguntarle nada a Supabase. `getUser()` hacía lo
   * mismo pero gastando un viaje de red en cada navegación: con el servidor en
   * Washington y la base en Canadá, eso eran un par de décimas por cada clic,
   * ocho horas por día.
   *
   * No se pierde seguridad. `getSession()` sí sería inseguro —lee la cookie y
   * le cree—, pero esto comprueba la firma criptográfica: una cookie
   * manipulada no pasa. Y si el proyecto usara claves simétricas, la propia
   * biblioteca vuelve sola a preguntarle a Supabase.
   *
   * El refresco del token sigue igual: `getClaims()` pasa por `getSession()`,
   * que renueva cuando está por vencer y deja las cookies nuevas en la
   * respuesta.
   */
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

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
