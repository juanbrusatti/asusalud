"use client";

import { useCallback, useState } from "react";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Instalar } from "./instalar";
import { Notificaciones } from "./notificaciones";

/**
 * Instalar la aplicación y prender los avisos.
 *
 * Son las dos cosas que se hacen una sola vez, al principio, y que si no están
 * a la vista no las hace nadie: quedan escondidas en un menú del navegador que
 * la mayoría nunca abre.
 *
 * Qué se puede hacer depende del navegador —en iPhone no hay botón de
 * instalar, en Firefox de escritorio no hay ninguno de los dos— así que la
 * tarjeta la dibuja este componente y no la pantalla: si no hay nada que
 * ofrecer, no queda un título con un hueco abajo.
 */
export function TenelaAMano({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [instalar, setInstalar] = useState(false);
  const [avisos, setAvisos] = useState(false);

  // Memorizadas: sin esto cambian en cada render y los efectos de los hijos
  // vuelven a correr para siempre.
  const verInstalar = useCallback((v: boolean) => setInstalar(v), []);
  const verAvisos = useCallback((v: boolean) => setAvisos(v), []);

  const hayAlgo = instalar || avisos;

  return (
    <Card className={hayAlgo ? undefined : "hidden"}>
      <CardBody className="grid gap-3">
        <CardTitle>Tenela a mano</CardTitle>
        <Instalar onVisible={verInstalar} />
        <Notificaciones
          vapidPublicKey={vapidPublicKey}
          onVisible={verAvisos}
        />
      </CardBody>
    </Card>
  );
}
