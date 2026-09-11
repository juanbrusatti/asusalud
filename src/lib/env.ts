import { z } from "zod";

/**
 * Las variables de entorno se validan al arrancar, no cuando alguien las usa.
 * Un deploy sin configurar tiene que fallar en el build con un mensaje claro,
 * no a las tres semanas con un `undefined` en medio de un envío.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL tiene que ser la URL del proyecto Supabase.",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, {
    message: "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY (clave pública del proyecto).",
  }),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
});

/**
 * Next.js reemplaza `process.env.NEXT_PUBLIC_*` en tiempo de compilación sólo
 * si se escriben literales, así que no se puede iterar sobre process.env.
 */
const rawPublic = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  · ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Faltan variables de entorno o están mal.\n${detail}\n` +
        `Copiá .env.example a .env.local y completalo. Ver docs/variables-de-entorno.md`,
    );
  }
  return result.data;
}

export const publicEnv = parse(publicSchema, rawPublic);

/** Sólo se puede llamar desde el servidor. */
export function serverEnv() {
  return parse(serverSchema, {
    ...rawPublic,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
