"use client";

import { useEffect } from "react";

/**
 * Registra el service worker una vez cargada la página, para no competir con
 * el primer render. En desarrollo no se registra: un worker cacheando build
 * artifacts en caliente sólo genera confusión.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Que falle el registro no puede romper la aplicación.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
