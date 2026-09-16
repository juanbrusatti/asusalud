"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import {
  conectarWhatsapp,
  desconectarWhatsapp,
  type ConexionState,
} from "@/lib/actions/whatsapp";
import { Guardar, Resultado } from "../_components/guardar";

const INICIAL: ConexionState = { error: null };

/**
 * Pegar las credenciales de Meta, o soltar el número.
 *
 * El formulario aparece plegado cuando ya hay una cuenta conectada: volver a
 * cargar credenciales es lo raro, no lo común, y tenerlo abierto invita a
 * romper algo que funciona.
 */
export function FormWhatsapp({ conectada,
  verifyToken,
}: { conectada: boolean;
  verifyToken: string;
}) {
  const [state, action] = useActionState(conectarWhatsapp, INICIAL);
  const [abierto, setAbierto] = useState(!conectada);
  const [soltando, startSoltar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);

  const enviados = state.values;

  return (
    <div className="grid gap-4">
      {conectada && !abierto && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-muted">
              Si cambiaste el número o generaste un token nuevo en Meta, cargalo
              de nuevo acá.
            </p>
            <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
              Cambiar credenciales
            </Button>
          </CardBody>
        </Card>
      )}

      {abierto && (
        <form action={action}>
          <Card>
            <CardBody className="grid gap-5">
              <CardTitle>Pegá lo que te dio Meta</CardTitle>

              <Field
                label="Identificador del número"
                name="phoneNumberId"
                required
                inputMode="numeric"
                defaultValue={enviados?.phoneNumberId ?? ""}
                placeholder="123456789012345"
                hint="Meta lo llama «Phone number ID». No es tu número de teléfono."
              />

              <Field
                label="Token permanente"
                name="accessToken"
                required
                type="password"
                autoComplete="off"
                placeholder="EAA…"
                hint="El de un usuario del sistema, sin vencimiento. Los que Meta muestra de entrada duran 24 horas."
              />

              <Field
                label="Identificador de la cuenta de WhatsApp"
                name="wabaId"
                defaultValue={enviados?.wabaId ?? ""}
                placeholder="Opcional"
                hint="Meta lo llama «WhatsApp Business Account ID». Sirve para leer la calidad del número."
              />

              <Field
                label="Tu número, como lo ven tus clientes"
                name="displayPhone"
                defaultValue={enviados?.displayPhone ?? ""}
                placeholder="+54 9 358 412-3456"
                hint="Opcional. Es sólo para reconocerlo en esta pantalla."
              />

              <details className="grid gap-4">
                <summary className="cursor-pointer text-[13.5px] font-medium text-muted">
                  Clave secreta de la aplicación
                </summary>

                <p className="max-w-prose text-[13px] leading-relaxed text-muted">
                  Sin esto los mensajes salen igual, pero no vas a saber si
                  llegaron ni van a volver las respuestas de los botones. Está
                  en Meta, en «Configuración de la app → Básica».
                </p>

                <Field
                  label="Clave secreta de la aplicación"
                  name="appSecret"
                  type="password"
                  autoComplete="off"
                  placeholder="Opcional"
                  hint="Meta la llama «App secret». Con ella se comprueba que cada aviso venga de verdad de Meta."
                />

                {/* Va fija y sin mostrarse acá: la persona ya la copió de
                    la tarjeta de arriba, y volver a pedirla en un campo vacío
                    invita a escribir otra cosa y a que no coincidan. */}
                <input type="hidden" name="verifyToken" value={verifyToken} />
              </details>

              <Resultado state={state} />

              <div className="flex flex-wrap gap-2">
                <Guardar />
                {conectada && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setAbierto(false)}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </form>
      )}

      {conectada && (
        <Card>
          <CardBody className="grid justify-items-start gap-2">
            <CardTitle>Desconectar</CardTitle>
            <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
              Los recordatorios dejan de salir por WhatsApp y pasan a mandarse
              por correo o por notificación. Los turnos, los clientes y todo lo
              demás quedan intactos.
            </p>

            {confirmar ? (
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={soltando}
                  onClick={() => startSoltar(() => void desconectarWhatsapp())}
                >
                  {soltando ? "Desconectando…" : "Sí, desconectar"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmar(false)}>
                  Mejor no
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="mt-1"
                onClick={() => setConfirmar(true)}
              >
                Desconectar WhatsApp
              </Button>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
