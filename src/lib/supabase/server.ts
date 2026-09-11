import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Cliente para Server Components, Server Actions y Route Handlers.
 * Actúa siempre en nombre de la persona que hizo el pedido: la RLS sigue
 * siendo la que decide qué ve.
 *
 * Va memoizado con `cache` y eso NO es una optimización, es corrección.
 * Supabase rota el refresh token cada vez que renueva la sesión: si un mismo
 * pedido arma dos clientes, los dos intentan renovar con el mismo token, el
 * segundo se encuentra con que ya fue consumido y la sesión se cae entera.
 * El síntoma es una persona que apretó "Guardar" y apareció en la pantalla de
 * ingreso sin entender por qué.
 */
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Los Server Components no pueden escribir cookies. El refresco de
            // sesión lo hace el middleware, así que acá se puede ignorar.
          }
        },
      },
    },
  );
});
