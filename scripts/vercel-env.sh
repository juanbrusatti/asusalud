#!/usr/bin/env bash
#
# Carga las variables de entorno en Vercel.
#
#   scripts/vercel-env.sh prod      → entorno Production  (.env.production.local)
#   scripts/vercel-env.sh preview   → entorno Preview     (.env.preview.local)
#
# Los valores salen de archivos `.env*.local`, que git ignora: las claves nunca
# entran al repositorio. El script tampoco las imprime, así que se puede correr
# con alguien mirando la pantalla.
#
# Antes: `npx vercel login` y `npx vercel link`.

set -euo pipefail

destino="${1:-}"

case "$destino" in
  prod)    entorno="production"; archivo=".env.production.local" ;;
  preview) entorno="preview";    archivo=".env.preview.local" ;;
  *)
    echo "Uso: $0 prod|preview" >&2
    exit 1
    ;;
esac

if [ ! -f "$archivo" ]; then
  echo "No encontré $archivo." >&2
  exit 1
fi

if ! npx --no-install vercel whoami >/dev/null 2>&1; then
  echo "No hay sesión de Vercel. Corré: npx vercel login" >&2
  exit 1
fi

if [ ! -f .vercel/project.json ]; then
  echo "Este directorio no está enlazado a un proyecto. Corré: npx vercel link" >&2
  exit 1
fi

echo "Cargando variables en el entorno «$entorno»…"

while IFS= read -r linea || [ -n "$linea" ]; do
  # Comentarios y líneas en blanco.
  case "$linea" in ''|\#*) continue ;; esac
  [[ "$linea" != *=* ]] && continue

  clave="${linea%%=*}"
  valor="${linea#*=}"
  [ -z "$valor" ] && { echo "  · $clave — vacía, se saltea"; continue; }

  # Reemplazar en lugar de acumular: Vercel deja agregar la misma clave dos
  # veces y después no se sabe cuál gana.
  npx --no-install vercel env rm "$clave" "$entorno" --yes >/dev/null 2>&1 || true
  printf '%s' "$valor" | npx --no-install vercel env add "$clave" "$entorno" >/dev/null

  echo "  · $clave"
done < "$archivo"

echo
echo "Listo. El próximo deploy las toma; el actual no se rehace solo."
