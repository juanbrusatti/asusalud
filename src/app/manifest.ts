import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA. `display: standalone` es lo que hace que se sienta una
 * aplicación y no una pestaña: sin barra de direcciones y con su propio icono
 * en la pantalla de inicio.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dlay Agenda",
    short_name: "Dlay",
    description:
      "Agenda, clientes y recordatorios automáticos para negocios.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f3ee",
    theme_color: "#f5f3ee",
    lang: "es-AR",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
