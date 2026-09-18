"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { unirse, type EquipoState } from "@/lib/actions/equipo";

export function Unirse({ token }: { token: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [estado, setEstado] = useState<EquipoState | null>(null);

  return (
    <Card>
      <CardBody className="grid gap-4">
        {estado?.error ? (
          <>
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] leading-relaxed text-danger"
            >
              {estado.error}
            </p>
            <Button variant="outline" onClick={() => router.push("/")}>
              Ir al inicio
            </Button>
          </>
        ) : estado?.notice ? (
          <>
            <p className="rounded-[14px] bg-ok-wash px-3.5 py-2.5 text-[13.5px] text-ok">
              {estado.notice}
            </p>
            <Button onClick={() => router.push("/")}>Entrar al sistema</Button>
          </>
        ) : (
          <Button
            size="lg"
            disabled={pendiente}
            onClick={() =>
              empezar(async () => {
                setEstado(await unirse(token));
              })
            }
          >
            {pendiente ? "Sumándote…" : "Aceptar y sumarme"}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
