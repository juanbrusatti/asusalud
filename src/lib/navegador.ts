"use client";

import { useSyncExternalStore } from "react";

/**
 * Leer cosas guardadas en el navegador sin romper la hidratación.
 *
 * El servidor no puede ver el almacenamiento del navegador, así que el primer
 * dibujo siempre sale con los valores de fábrica. Si el cliente dibujara otra
 * cosa en ese mismo momento, React se queja y descarta el HTML del servidor.
 *
 * `useSyncExternalStore` existe justamente para esto: devuelve el valor del
 * servidor mientras se hidrata y recién después el de verdad. Es además la
 * única forma que acepta el linter, que prohíbe llamar a `setState` dentro de
 * un efecto porque encadena dibujos.
 */

/** Nadie avisa cuando cambia el almacenamiento de la propia pestaña. */
function sinAvisos() {
  return () => {};
}

/**
 * Falso mientras se hidrata, verdadero después.
 *
 * Sirve para tapar lo que dependa del navegador hasta que sea seguro
 * mostrarlo.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    sinAvisos,
    () => true,
    () => false,
  );
}

/** Lo guardado bajo una llave, ya interpretado. Nunca tira. */
export function leerGuardado<T>(llave: string): Partial<T> {
  if (typeof window === "undefined") return {};
  try {
    const crudo = window.localStorage.getItem(llave);
    return crudo ? (JSON.parse(crudo) as Partial<T>) : {};
  } catch {
    // Navegador sin almacenamiento, o algo viejo e ilegible. Se sigue con los
    // valores de fábrica: es molesto, no impide nada.
    return {};
  }
}

/** Guardar, sin que importe si el navegador lo permite. */
export function escribirGuardado(llave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(llave, JSON.stringify(valor));
  } catch {
    // En modo privado, o con el almacenamiento lleno. Lo único que se pierde
    // es el avance al cerrar la pestaña.
  }
}

/** La llave donde el asistente de WhatsApp deja lo suyo, por negocio. */
export function llaveWhatsapp(tenantId: string): string {
  return `dlay:whatsapp:${tenantId}`;
}
