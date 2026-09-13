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
# Lo que todavía hay que correr a mano
# ---------------------------------------------------------------------------
# Estas tres filas viven en la base porque el reloj de Postgres las lee desde
# adentro, y no hay forma de escribirlas sin la contraseña de la base.
# La dirección del sitio es la de la aplicación en Vercel, no la de Supabase:
# es la que termina dentro del enlace que recibe la clienta. Si no está, se
# deja una marca que no se puede pegar por accidente.
sitio=$(grep -E '^NEXT_PUBLIC_SITE_URL=' "$archivo" | cut -d= -f2- || true)
[ -z "$sitio" ] && sitio="https://CAMBIAR-POR-EL-DOMINIO-REAL"
dispatch_secret=$(grep -E '^DISPATCH_SECRET=' "$secretos" | cut -d= -f2-)

pendiente="platform-settings.$destino.sql"
cat > "$pendiente" <<EOF
-- Pegá esto en el SQL editor de ${ref} y ejecutalo una vez.
-- Si abajo dice CAMBIAR-POR-EL-DOMINIO-REAL, poné el dominio de la aplicación
-- antes de ejecutarlo: de ahí sale el enlace que reciben las clientas.
insert into public.platform_settings (key, value) values
  ('site_url',        '$sitio'),
  ('dispatch_url',    'https://$ref.supabase.co/functions/v1/dispatch'),
  ('dispatch_secret', '$dispatch_secret')
on conflict (key) do update set value = excluded.value;
EOF
chmod 600 "$pendiente"

echo
echo "Funciones desplegadas."
echo "Falta un paso: abrí $pendiente y pegá su contenido en el SQL editor."
echo "(Tiene el secreto adentro, por eso no se imprime acá.)"
