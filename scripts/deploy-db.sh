#!/usr/bin/env bash
#
# Aplica las migraciones a un proyecto Supabase remoto.
#
#   scripts/deploy-db.sh prod      → el proyecto de la estética
#   scripts/deploy-db.sh preview   → el de desarrollo
#
# La referencia del proyecto se saca de la URL que hay en el archivo de
# entorno, así que no hay nada que repetir acá.
#
# Supabase va a pedir la CONTRASEÑA DE LA BASE, que es la que se eligió al
# crear el proyecto. Si no la tenés, se cambia en
# Settings → Database → Reset database password.

set -euo pipefail

destino="${1:-}"

case "$destino" in
  prod)    archivo=".env.production.local" ;;
  preview) archivo=".env.preview.local" ;;
  *)
    echo "Uso: $0 prod|preview" >&2
    exit 1
    ;;
esac

if [ ! -f "$archivo" ]; then
  echo "No encontré $archivo." >&2
  exit 1
fi

url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$archivo" | cut -d= -f2-)
# https://abcdefgh.supabase.co → abcdefgh
ref=$(printf '%s' "$url" | sed -E 's#^https://([^.]+)\..*$#\1#')

if [ -z "$ref" ] || [ "$ref" = "$url" ]; then
  echo "No pude sacar la referencia del proyecto de: $url" >&2
  exit 1
fi

echo "Proyecto: $ref"
echo

# Volver a enlazar cuando ya está enlazado al mismo proyecto sólo sirve para
# que vuelva a pedir la contraseña. Reintentar un push tiene que ser barato.
actual=""
[ -f supabase/.temp/project-ref ] && actual=$(cat supabase/.temp/project-ref)

if [ "$actual" = "$ref" ]; then
  echo "Ya enlazado a $ref."
else
  npx supabase link --project-ref "$ref"
fi

npx supabase db push

echo
echo "Migraciones aplicadas. Falta cargar platform_settings y los secretos de"
echo "las Edge Functions: ver docs/despliegue.md"
