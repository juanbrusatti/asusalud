"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** El aviso que guarda el script del layout antes de que React monte. */
type AvisoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __dlayInstall?: AvisoInstalacion | null;
  }
}

type Estado =
  | "cargando"
  /** Ya está instalada y abierta como aplicación. */
  | "instalada"
  /** El navegador ofrece instalarla con un botón. */
  | "instalable"
  /** iPhone o iPad: no hay botón, hay que explicar el camino. */
  | "ios"
  /** No se puede instalar acá, o no hace falta. */
  | "nada";

function esApple(): boolean {
  const ua = navigator.userAgent;
  // Un iPad con iPadOS 13+ se presenta como Mac; lo delata la pantalla táctil.
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function yaInstalada(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari en iOS no implementa display-mode y usa esto.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/**
 * Instalar la aplicación en el teléfono o en la computadora.
 *
 * Instalada deja de ser una pestaña: tiene su icono, abre sin barra de
 * direcciones y —en iPhone— es la única forma de que lleguen las
 * notificaciones. Por eso el botón está a la vista y no escondido en un menú
 * del navegador que nadie encuentra.
 */
export function Instalar({
  onVisible,
}: {
  /** Avisa si hay algo que mostrar, para que nadie dibuje una tarjeta vacía. */
  onVisible?: (visible: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let vivo = true;

    // Dentro de una función async para que el estado se escriba en una
    // microtarea y no en medio del render.
    async function revisar(): Promise<Estado> {
      if (yaInstalada()) return "instalada";
      if (window.__dlayInstall) return "instalable";
      if (esApple()) return "ios";
      return "nada";
    }

    const aplicar = () => {
      revisar().then((e) => {
        if (!vivo) return;
        setEstado(e);
        onVisible?.(e !== "nada");
      });
    };

    aplicar();

    // Por si el aviso llega después de que montamos.
    window.addEventListener("dlay:instalable", aplicar);
    window.addEventListener("appinstalled", aplicar);

    return () => {
      vivo = false;
      window.removeEventListener("dlay:instalable", aplicar);
      window.removeEventListener("appinstalled", aplicar);
    };
  }, [onVisible]);

  async function instalar() {
    const aviso = window.__dlayInstall;
    if (!aviso) return;

    setTrabajando(true);
    try {
      await aviso.prompt();
      const { outcome } = await aviso.userChoice;
      // El aviso se usa una sola vez: el navegador no lo vuelve a dar.
      window.__dlayInstall = null;
      const siguiente = outcome === "accepted" ? "instalada" : "nada";
      setEstado(siguiente);
      onVisible?.(siguiente !== "nada");
    } catch {
      setEstado("nada");
      onVisible?.(false);
    } finally {
      setTrabajando(false);
    }
  }

  if (estado === "cargando" || estado === "nada") return null;

  if (estado === "instalada") {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        Ya la tenés instalada en este dispositivo.
      </p>
    );
  }

  if (estado === "ios") {
    return (
      <div className="grid gap-1.5">
        <p className="text-[13.5px] leading-relaxed text-muted">
          En iPhone y iPad se agrega a mano, desde Safari: tocá{" "}
          <strong className="text-ink">Compartir</strong> —el cuadradito con la
          flecha hacia arriba— y después{" "}
          <strong className="text-ink">Agregar a inicio</strong>.
        </p>
        <p className="text-[12.5px] leading-snug text-faint">
          Es el único camino en iPhone, y además es lo que habilita las
          notificaciones: sin la aplicación agregada, Apple no las entrega.
        </p>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-2">
      <p className="text-[13.5px] leading-relaxed text-muted">
        Instalada abre como una aplicación, con su icono y sin la barra del
        navegador. Ocupa lo mismo que una pestaña.
      </p>
      <Button size="sm" disabled={trabajando} onClick={() => void instalar()}>
        {trabajando ? "Instalando…" : "Instalar la aplicación"}
      </Button>
    </div>
  );
}
