/**
 * Genera el par de claves de las notificaciones push.
 *
 * Se corre una sola vez por proyecto: `node scripts/vapid.mjs`.
 * La pública va en NEXT_PUBLIC_VAPID_PUBLIC_KEY y viaja al navegador.
 * La privada va en las Edge Functions y no sale de ahí nunca.
 *
 * Si se cambian, todas las suscripciones existentes dejan de funcionar y cada
 * persona tiene que volver a activarlas.
 */
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const base64url = (buffer) =>
  buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// La clave pública son los últimos 65 bytes del DER; la privada, 32 bytes
// en una posición fija del PKCS#8.
const pub = publicKey.export({ type: "spki", format: "der" }).subarray(-65);
const priv = privateKey.export({ type: "pkcs8", format: "der" }).subarray(36, 68);

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${base64url(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${base64url(priv)}`);
