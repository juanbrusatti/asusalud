import type { Metadata, Viewport } from "next";
import { Caveat, Inter } from "next/font/google";
import "./globals.css";

/**
 * Dos familias que contrastan a propósito: una sans geométrica para toda la
 * interfaz y una manuscrita reservada para titulares y datos clave.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dlay Agenda",
    template: "%s · Dlay",
  },
  description:
    "Agenda, clientes y recordatorios automáticos para negocios. Menos tiempo administrando, más tiempo atendiendo.",
  applicationName: "Dlay",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Dlay",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin maximumScale: bloquear el zoom rompe la accesibilidad y no arregla nada.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body className={`${inter.variable} ${caveat.variable} antialiased`}>
        {/*
          El navegador avisa una sola vez que la aplicación se puede instalar, y
          lo hace apenas termina de cargar la página: muchas veces antes de que
          React monte nada. Si no hay nadie escuchando en ese momento, el aviso
          se pierde y el botón de instalar no aparece nunca.

          Por eso se guarda acá, en un script que corre antes que todo lo demás.
          El botón lo busca cuando monta.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){" +
              "e.preventDefault();window.__dlayInstall=e;" +
              "window.dispatchEvent(new Event('dlay:instalable'))});" +
              "window.addEventListener('appinstalled',function(){" +
              "window.__dlayInstall=null})",
          }}
        />
        {children}
      </body>
    </html>
  );
}
