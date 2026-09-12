import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Las Edge Functions corren en Deno, con sus propias globales y sus
    // importaciones por URL. Las revisa `deno lint`, no ESLint.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
