"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  marcarVisto,
  responder,
  type FormState,
} from "@/lib/actions/mensajes";
import type { Mensaje } from "@/lib/data/mensajes";
import { createClient } from "@/lib/supabase/client";

const INITIAL: FormState = { error: null };

function Enviar({ abierta }: { abierta: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !abierta}>
      {pending ? "Enviando…" : "Enviar"}
    </Button>
  );
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Hilo({
  telefono,
  nombre,
  mensajes,
  ventana,
  abierta,
  tenantId,
}: {
  telefono: string;
  nombre: string | null;
  mensajes: Mensaje[];
  ventana: string;
  abierta: boolean;
  tenantId: string;
}) {
  const [state, action] = useActionState(responder, INITIAL);
  const router = useRouter();
  const caja = useRef<HTMLFormElement>(null);

  // Se vacía sólo cuando salió. Si falló, el texto sigue ahí: hacer reescribir
  // un mensaje que no se envió es la peor forma de avisar que falló.
  useEffect(() => {
    if (state.notice) caja.current?.reset();
  }, [state.notice]);

  // Abrirla es haberla visto. Una sola vez por conversación: el contador de
  // la barra se recalcula del lado del servidor y volver a marcarla en cada
  // dibujo encadenaría refrescos.
  const marcada = useRef<string | null>(null);
  useEffect(() => {
    if (marcada.current === telefono) return;
    marcada.current = telefono;
    void marcarVisto(telefono);
  }, [telefono]);

  // Si contesta mientras la pantalla está abierta, aparece sin recargar.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`bandeja:${tenantId}:${telefono}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_inbound",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [tenantId, telefono, router]);

  return (
    <main className="mx-auto grid max-w-2xl gap-4 px-4 py-8">
      <div>
        <Link
          href="/mensajes"
          className="text-[13px] text-muted hover:text-ink"
        >
          ← Mensajes
        </Link>
        <h1 className="mt-1 text-[24px] font-bold leading-tight tracking-[-0.03em]">
          {nombre ?? `+${telefono}`}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted">{ventana}</p>
      </div>

      <div className="grid gap-2">
        {mensajes.map((m, i) => (
          <div
            key={`${m.cuando}-${i}`}
            className={m.entrante ? "mr-10" : "ml-10"}
          >
            <div
              className={`rounded-[14px] px-3.5 py-2.5 ${
                m.entrante
                  ? "bg-surface-2 text-ink"
                  : "bg-accent text-on-accent"
              }`}
            >
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                {/* Un botón no trae texto escrito: trae lo que se apretó. */}
                {m.payload
                  ? `Apretó «${m.payload.split(":")[0]}»`
                  : (m.body ?? "(sin texto)")}
              </p>
            </div>
            <p className="mt-0.5 px-1 text-[11.5px] text-faint">
              {hora(m.cuando)}
              {!m.entrante && (m.sent_by ? "" : " · automático")}
            </p>
          </div>
        ))}
      </div>

      <form ref={caja} action={action} className="grid gap-2">
        <input type="hidden" name="telefono" value={telefono} />
        <Textarea
          label="Contestar"
          name="texto"
          rows={3}
          maxLength={4096}
          disabled={!abierta}
          placeholder={
            abierta
              ? "Escribile…"
              : "WhatsApp no deja escribirle hasta que vuelva a escribirte."
          }
          hint={
            abierta
              ? undefined
              : "Meta sólo permite texto libre dentro de las 24 horas posteriores al último mensaje del cliente."
          }
        />

        {state.error && (
          <p className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] leading-snug text-ink">
            {state.error}
          </p>
        )}

        <div className="flex justify-end">
          <Enviar abierta={abierta} />
        </div>
      </form>
    </main>
  );
}
