#!/usr/bin/env bash
#
# ¿Por qué no llega un aviso?
#
#   scripts/diagnostico.sh prod|preview
#
# Pregunta a la base en qué estado quedó cada eslabón de la cadena y lo
# imprime. No devuelve datos de nadie: sólo cantidades y si falta un ajuste,
# así que se puede pegar en un chat sin pensarlo dos veces.

set -euo pipefail

destino="${1:-}"

case "$destino" in
  prod)    archivo=".env.production.local" ;;
  preview) archivo=".env.preview.local" ;;
  *) echo "Uso: $0 prod|preview" >&2; exit 1 ;;
esac

[ -f "$archivo" ] || { echo "No encontré ${archivo}." >&2; exit 1; }

url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$archivo" | cut -d= -f2-)
clave=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$archivo" | cut -d= -f2-)

[ -n "$clave" ] || { echo "Falta SUPABASE_SERVICE_ROLE_KEY en ${archivo}." >&2; exit 1; }

respuesta=$(curl -s -m 30 -X POST "${url}/rest/v1/rpc/rpc_avisos_diagnostico" \
  -H "apikey: ${clave}" \
  -H "Authorization: Bearer ${clave}" \
  -H "content-type: application/json" \
  -d '{}')

if command -v python3 >/dev/null 2>&1; then
  printf '%s' "$respuesta" | python3 -m json.tool 2>/dev/null || printf '%s\n' "$respuesta"
else
  printf '%s\n' "$respuesta"
fi
