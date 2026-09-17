#!/usr/bin/env bash
#
# Da o quita el acceso al panel de la plataforma (/plataforma).
#
#   scripts/plataforma-admin.sh prod|preview|local agregar correo@ejemplo.com
#   scripts/plataforma-admin.sh prod|preview|local quitar   correo@ejemplo.com
#
# La persona tiene que haber entrado al sistema al menos una vez: se busca por
# el correo con el que inició sesión.
#
# No hay forma de hacer esto desde el navegador, y es a propósito: la tabla no
# tiene ninguna política, así que sólo se llega con la clave del servidor.

set -euo pipefail

# Ojo con escribir `$variable` pegada a un carácter no ASCII: el bash 3.2 de
# macOS se come esos bytes como parte del nombre. Siempre `${variable}`.

destino="${1:-}"
accion="${2:-}"
correo="${3:-}"

case "$destino" in
  prod)    archivo=".env.production.local" ;;
  preview) archivo=".env.preview.local" ;;
  local)   archivo="" ;;
  *)
    echo "Uso: $0 prod|preview|local agregar|quitar correo@ejemplo.com" >&2
    exit 1
    ;;
esac

case "$accion" in
  agregar) funcion="rpc_platform_admin_add" ;;
  quitar)  funcion="rpc_platform_admin_remove" ;;
  *)
    echo "Uso: $0 prod|preview|local agregar|quitar correo@ejemplo.com" >&2
    exit 1
    ;;
esac

if [ -z "$correo" ]; then
  echo "Falta el correo." >&2
  exit 1
fi

if [ "$destino" = "local" ]; then
  url="http://127.0.0.1:54321"
  clave=$(npx supabase status -o env 2>/dev/null \
            | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
else
  [ -f "$archivo" ] || { echo "No encontré ${archivo}." >&2; exit 1; }
  url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$archivo" | cut -d= -f2-)
  clave=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$archivo" | cut -d= -f2-)
fi

if [ -z "${clave:-}" ]; then
  echo "No encontré la clave de servicio para ${destino}." >&2
  exit 1
fi

respuesta=$(curl -s -m 30 -X POST "${url}/rest/v1/rpc/${funcion}" \
  -H "apikey: ${clave}" \
  -H "Authorization: Bearer ${clave}" \
  -H "content-type: application/json" \
  -d "$(printf '{"p_email":"%s"}' "$correo")")

if printf '%s' "$respuesta" | grep -q '"ok": *true'; then
  if [ "$accion" = "agregar" ]; then
    echo "Listo: ${correo} ya puede entrar a /plataforma."
  else
    echo "Listo: ${correo} ya no entra a /plataforma."
  fi
else
  echo "No se pudo: ${respuesta}" >&2
  exit 1
fi
