import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/auth/tenant";
import {
  getConversacion,
  getConversaciones,
  minutosDeVentana,
  ventanaEnPalabras,
} from "@/lib/data/mensajes";
import { Hilo } from "./hilo";

export const metadata: Metadata = { title: "Conversación" };

export default async function ConversacionPage({
  params,
}: {
  params: Promise<{ telefono: string }>;
}) {
  const { telefono } = await params;

  const membership = await getCurrentTenant();
  if (!membership) return null;

  const solo = telefono.replace(/\D/g, "");
  if (!solo) notFound();

  const [mensajes, conversaciones] = await Promise.all([
    getConversacion(membership.tenant.id, solo),
    getConversaciones(membership.tenant.id),
  ]);

  const cabecera = conversaciones.find((c) => c.telefono === solo);
  if (!cabecera) notFound();

  const minutos = minutosDeVentana(cabecera.ventana_hasta);

  return (
    <Hilo
      telefono={solo}
      nombre={cabecera.nombre}
      mensajes={mensajes}
      ventana={ventanaEnPalabras(cabecera.ventana_hasta)}
      abierta={minutos !== null && minutos > 0}
      tenantId={membership.tenant.id}
    />
  );
}
