#!/usr/bin/env bash
#
# Despliega las Edge Functions y deja listo lo que hace falta para que el
# emisor funcione.
#
#   scripts/deploy-funciones.sh prod|preview
#
# Hace tres cosas:
#   1. Genera el secreto compartido entre la base y el emisor, si no existe.
#   2. Carga los secretos en Supabase y despliega las funciones.
#   3. Escribe el SQL que falta correr, con los valores ya puestos, en un
#      archivo que git ignora. No lo imprime en pantalla.

set -euo pipefail

# Ojo con escribir `$variable` pegada a un carácter no ASCII —una tilde, un «»,
# unos puntos suspensivos—: el bash 3.2 que trae macOS se come esos bytes como
# parte del nombre de la variable y el script muere con «unbound variable».
# Siempre `${variable}`.

destino="${1:-}"

case "$destino" in
  prod)    archivo=".env.production.local" ;;
  preview) archivo=".env.preview.local" ;;
  *)
    echo "Uso: $0 prod|preview" >&2
    exit 1
    ;;
esac

[ -f "$archivo" ] || { echo "No encontré $archivo." >&2; exit 1; }
[ -f supabase/functions/.env ] || {
  echo "No encontré supabase/functions/.env con las claves VAPID." >&2
  exit 1
}

url=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$archivo" | cut -d= -f2-)
ref=$(printf '%s' "$url" | sed -E 's#^https://([^.]+)\..*$#\1#')

actual=""
[ -f supabase/.temp/project-ref ] && actual=$(cat supabase/.temp/project-ref)

if [ "$actual" != "$ref" ]; then
  echo "Enlazando con ${ref}…"
  npx supabase link --project-ref "$ref"
fi

# ---------------------------------------------------------------------------
# El secreto compartido
# ---------------------------------------------------------------------------
# La base lo manda en una cabecera y el emisor lo compara. Sin él, cualquiera
# puede forzar el vaciado de la cola desde afuera.
secretos=".env.functions.$destino.local"

if [ ! -f "$secretos" ]; then
  echo "Generando el secreto del emisor…"
  {
    grep -E '^VAPID_(PUBLIC_KEY|PRIVATE_KEY|SUBJECT)=' supabase/functions/.env
    echo "DISPATCH_SECRET=$(openssl rand -hex 32)"
  } > "$secretos"
  chmod 600 "$secretos"
fi

npx supabase secrets set --env-file "$secretos"
npx supabase functions deploy dispatch
npx supabase functions deploy whatsapp-webhook

# ---------------------------------------------------------------------------
# Comprobar que el portero deja pasar
# ---------------------------------------------------------------------------
# Supabase exige un JWT suyo salvo que `config.toml` diga lo contrario para la
# función. Si el portero está puesto, el reloj de Postgres y Meta se comen un
# 401 sin que aparezca un error en ningún lado: simplemente no pasa nada. Es la
# clase de falla que cuesta días encontrar, así que se verifica acá.
dispatch_secret_probe=$(grep -E '^DISPATCH_SECRET=' "$secretos" | cut -d= -f2-)
respuesta=$(curl -s -m 30 -X POST "https://${ref}.supabase.co/functions/v1/dispatch" \
  -H "content-type: application/json" \
  -H "x-dlay-secret: ${dispatch_secret_probe}" \
  -d '{}' || true)

echo
if printf '%s' "$respuesta" | grep -q '"tomados"'; then
  echo "El emisor responde: ${respuesta}"
else
  echo "AVISO: el emisor no respondió como se esperaba." >&2
  echo "  Respuesta: ${respuesta}" >&2
  echo "  Si dice «Missing authorization header», falta redesplegar con el" >&2
  echo "  bloque [functions.dispatch] verify_jwt = false de supabase/config.toml." >&2
fi

# ---------------------------------------------------------------------------
# Los ajustes que viven dentro de la base
# ---------------------------------------------------------------------------
# `dispatch_url`, `dispatch_secret` y `site_url` viven en una tabla porque el
# reloj de Postgres los lee desde adentro. Antes había que pegarlos a mano en
# el panel, que es justo el paso que se olvida: sin `dispatch_url` la cola se
# llena y no la vacía nadie, sin que aparezca ningún error.
sitio=$(grep -E '^NEXT_PUBLIC_SITE_URL=' "$archivo" | cut -d= -f2- || true)
clave=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$archivo" | cut -d= -f2-)

if [ -z "$sitio" ] || printf '%s' "$sitio" | grep -q 'CAMBIAR'; then
  echo "AVISO: falta NEXT_PUBLIC_SITE_URL en ${archivo}." >&2
  echo "  Es el dominio de la aplicación, del que sale el enlace que recibe" >&2
  echo "  cada cliente dentro del mensaje. Ponelo y volvé a correr esto." >&2
  exit 1
fi

ajustar() {
  local k="$1" v="$2"
  local r
  r=$(curl -s -m 30 -X POST "${url}/rest/v1/rpc/rpc_set_platform_setting" \
        -H "apikey: ${clave}" -H "Authorization: Bearer ${clave}" \
        -H "content-type: application/json" \
        -d "$(printf '{"p_key":"%s","p_value":"%s"}' "$k" "$v")")

  if printf '%s' "$r" | grep -q '"ok": *true'; then
    echo "  · ${k}"
  else
    echo "  · ${k} — NO se pudo: ${r}" >&2
    return 1
  fi
}

echo
echo "Escribiendo los ajustes de plataforma…"
ajustar site_url        "$sitio"
ajustar dispatch_url    "https://${ref}.supabase.co/functions/v1/dispatch"
ajustar dispatch_secret "$dispatch_secret_probe"

echo
echo "Listo. Comprobá con: scripts/diagnostico.sh ${destino}"
