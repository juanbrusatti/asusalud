"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { subscribeClientPush } from "@/lib/actions/autogestion";

type Estado = "cargando" | "no-soportado" | "bloqueado" | "listo" | "activo";

/**
 * Las claves viajan en base64 con el alfabeto de URL; el navegador las pide en
 * binario, sobre un ArrayBuffer propio porque `pushManager` exige ese tipo
 * exacto y no el genérico que devuelve `Uint8Array.from`.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normal);

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function encode(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Ofrecerle a la clienta los avisos de su turno.
 *
 * Es el único canal gratis del sistema: cada clienta que acepta es una que
 * deja de costar $37,68 por recordatorio, para siempre.
 *
 * Por eso el permiso **no se dispara solo**. Aparece con una explicación y un
 * botón, porque un permiso denegado no se puede volver a pedir: gastarlo mal
 * es perder el canal en ese dispositivo para siempre.
 *
 * Donde no puede funcionar —un iPhone sin la aplicación en la pantalla de
 * inicio, un navegador sin soporte— no se muestra nada. Ofrecer algo que no va
 * a andar es peor que no ofrecerlo.
 */
export function AvisosClienta({
  token,
  vapidPublicKey,
  tono = "claro",
}: {
  token: string;
  vapidPublicKey: string;
  /** Sobre el bloque de acento el texto va en blanco. */
  tono?: "claro" | "acento";
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;

    // Todo el chequeo dentro de una función async: escribir el estado de forma
    // sincrónica dentro del efecto encadena renders.
    async function revisar(): Promise<Estado> {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        !vapidPublicKey
      ) {
        return "no-soportado";
      }

      if (Notification.permission === "denied") return "bloqueado";

      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      return suscripcion ? "activo" : "listo";
    }

    revisar()
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado("no-soportado"));

    return () => {
      vivo = false;
    };
  }, [vapidPublicKey]);

  async function activar() {
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "listo");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const r = await subscribeClientPush(token, {
        endpoint: sub.endpoint,
        p256dh: encode(sub.getKey("p256dh")),
        auth: encode(sub.getKey("auth")),
        userAgent: navigator.userAgent.slice(0, 200),
      });

      setEstado(r.ok ? "activo" : "listo");
    } catch {
      setEstado("listo");
    } finally {
      setTrabajando(false);
    }
  }

  // Ni "no soportado" ni "bloqueado" dicen nada acá: quien está reservando un
  // turno no tiene por qué leer un problema técnico que no puede resolver.
  //
  // El recuadro lo dibuja este componente y no quien lo usa, porque si no,
  // cuando no hay nada que ofrecer queda una caja de color vacía en pantalla.
  if (estado === "cargando" || estado === "no-soportado" || estado === "bloqueado") {
    return null;
  }

  const acento = tono === "acento";
  const caja = acento
    ? "rounded-[16px] bg-white/15 px-4 py-3.5"
    : "rounded-[16px] bg-surface-2 px-4 py-3.5";
  const suave = acento ? "opacity-90" : "text-muted";

  if (estado === "activo") {
    return (
      <div className={caja}>
        <p className={`text-[13px] leading-relaxed ${suave}`}>
          Listo: te vamos a avisar por este dispositivo.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid justify-items-start gap-2 ${caja}`}>
      <p className={`text-[13.5px] leading-relaxed ${suave}`}>
        ¿Querés que te avisemos por acá en vez de por mensaje? Llega solo, no
        hace falta que dejes nada abierto.
      </p>
      <Button
        size="sm"
        variant={acento ? "outline" : "solid"}
        disabled={trabajando}
        onClick={() => void activar()}
      >
        {trabajando ? "Activando…" : "Avisarme por acá"}
      </Button>
    </div>
  );
}
