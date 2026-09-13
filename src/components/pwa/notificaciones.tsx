"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  removePushSubscription,
  savePushSubscription,
} from "@/lib/actions/push";

type Estado = "cargando" | "no-soportado" | "bloqueado" | "activo" | "inactivo";

/**
 * Las claves viajan en base64 con el alfabeto de URL; el navegador las pide en
 * binario. Se escribe sobre un ArrayBuffer propio porque `pushManager` exige
 * ese tipo exacto y no el genérico que devuelve `Uint8Array.from`.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normal);

  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
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
 * Activar o desactivar las notificaciones.
 *
 * Es el canal más barato del sistema: cada aviso que sale por acá en lugar de
 * WhatsApp son $37,68 que la estética no gasta. Por eso vale la pena pedirlo
 * bien y explicar para qué sirve, en vez de disparar el permiso del navegador
 * apenas alguien entra.
 */
export function Notificaciones({
  vapidPublicKey,
  onVisible,
}: {
  vapidPublicKey: string;
  /** Avisa si hay algo que mostrar, para que nadie dibuje una tarjeta vacía. */
  onVisible?: (visible: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [trabajando, setTrabajando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    /**
     * Todo el chequeo va dentro de una función async para que el estado se
     * escriba en una microtarea y no en medio del render: escribirlo de forma
     * sincrónica encadena renders.
     */
    async function revisar(): Promise<Estado> {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !vapidPublicKey
      ) {
        return "no-soportado";
      }

      if (Notification.permission === "denied") return "bloqueado";

      const registro = await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.getSubscription();
      if (!suscripcion) return "inactivo";

      /**
       * Que el navegador tenga una suscripción no significa que el servidor la
       * conozca: si el guardado falló alguna vez, el navegador se la queda para
       * siempre y esta pantalla diría «activadas» mientras no llega ni un
       * aviso. Pasó de verdad.
       *
       * Así que se vuelve a mandar en cada carga. Es idempotente —la base hace
       * un upsert por `endpoint`— y de paso repara sola a quien quedó a medias.
       */
      const { error } = await savePushSubscription({
        endpoint: suscripcion.endpoint,
        p256dh: encode(suscripcion.getKey("p256dh")),
        auth: encode(suscripcion.getKey("auth")),
        userAgent: navigator.userAgent.slice(0, 200),
      });

      return error ? "inactivo" : "activo";
    }

    revisar()
      .then((e) => {
        if (!vivo) return;
        setEstado(e);
        onVisible?.(e !== "no-soportado");
      })
      .catch(() => {
        if (!vivo) return;
        setEstado("no-soportado");
        onVisible?.(false);
      });

    return () => {
      vivo = false;
    };
  }, [vapidPublicKey, onVisible]);

  async function activar() {
    setTrabajando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const { error } = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: encode(sub.getKey("p256dh")),
        auth: encode(sub.getKey("auth")),
        userAgent: navigator.userAgent.slice(0, 200),
      });

      setFalla(error);
      setEstado(error ? "inactivo" : "activo");
    } catch (err) {
      setFalla(err instanceof Error ? err.message : "No se pudo activar.");
      setEstado("inactivo");
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setTrabajando(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } finally {
      setTrabajando(false);
    }
  }

  if (estado === "cargando" || estado === "no-soportado") return null;

  if (estado === "bloqueado") {
    return (
      <p className="text-[13px] leading-snug text-muted">
        Las notificaciones están bloqueadas en este navegador. Se habilitan
        desde el candado que está al lado de la dirección.
      </p>
    );
  }

  if (estado === "activo") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13.5px] text-muted">
          Las notificaciones están activadas en este dispositivo.
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={trabajando}
          onClick={() => void desactivar()}
        >
          Desactivar
        </Button>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-2">
      <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
        Activalas para enterarte al momento cuando entra una reserva o alguien
        cancela, sin tener que estar mirando la agenda.
      </p>
      <Button size="sm" disabled={trabajando} onClick={() => void activar()}>
        {trabajando ? "Activando…" : "Activar notificaciones"}
      </Button>

      {falla && (
        <p
          role="alert"
          className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13px] leading-snug text-danger"
        >
          {falla}
        </p>
      )}
    </div>
  );
}
