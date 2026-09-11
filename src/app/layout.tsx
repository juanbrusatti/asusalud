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
    default: "Dlay Estética",
    template: "%s · Dlay",
  },
  description:
    "Agenda, clientes y recordatorios automáticos para estéticas. Menos tiempo administrando, más tiempo atendiendo.",
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
        {children}
      </body>
    </html>
  );
}
