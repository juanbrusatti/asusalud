"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Copiable } from "@/components/ui/copiable";
import { Field } from "@/components/ui/field";
import {
  cancelarInvitacion,
  invitar,
  sacarDelEquipo,
  type EquipoState,
} from "@/lib/actions/equipo";
import {
  NOMBRE_ROL,
  ROLES_INVITABLES,
  type Invitacion,
  type Miembro,
  type RolEquipo,
} from "@/lib/equipo";

/**
 * Sumar gente, y sacarla.
 *
 * La invitación es un enlace que se copia, no un correo que se manda. Esta
 * gente se pasa todo por WhatsApp: un correo más es un correo que termina en
 * no deseado y una empleada que nunca entra.
 */
export function PanelEquipo({
  equipo,
  invitaciones,
  sitio,
}: {
  equipo: Miembro[];
  invitaciones: Invitacion[];
  sitio: string;
}) {
  const [pendiente, empezar] = useTransition();
  const [estado, setEstado] = useState<EquipoState | null>(null);
  const [invitando, setInvitando] = useState(false);
  const [rol, setRol] = useState<RolEquipo>("staff");
  const [nombre, setNombre] = useState("");
  const [sacando, setSacando] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Quiénes entran</CardTitle>
            {!invitando && (
              <Button size="sm" onClick={() => setInvitando(true)}>
                Invitar a alguien
              </Button>
            )}
          </div>

          <ul className="grid gap-1">
            {equipo.map((m) => (
              <li
                key={m.user_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-[1.5px] border-line-soft py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-medium">
                    {m.nombre}
                    {m.soy_yo && (
                      <span className="ml-2 text-[12px] font-normal text-faint">
                        vos
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[13px] text-muted">{m.correo}</p>
                </div>

                <span className="rounded-pill bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                  {NOMBRE_ROL[m.rol]}
                </span>

                {!m.soy_yo && m.rol !== "owner" && (
                  sacando === m.user_id ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pendiente}
                        onClick={() =>
                          empezar(async () => {
                            setEstado(await sacarDelEquipo(m.user_id));
                            setSacando(null);
                          })
                        }
                      >
                        Sí, sacar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSacando(null)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSacando(m.user_id)}
                    >
                      Sacar
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>

          {invitando && (
            <div className="grid gap-4 rounded-card border-[1.5px] border-line bg-surface-2 p-4">
              <p className="text-[13.5px] font-medium">¿Qué va a poder hacer?</p>

              <div className="grid gap-2">
                {ROLES_INVITABLES.map((r) => (
                  <button
                    key={r.valor}
                    type="button"
                    onClick={() => setRol(r.valor)}
                    className={`rounded-card border-[1.5px] px-3.5 py-2.5 text-left ${
                      rol === r.valor
                        ? "border-accent bg-accent-wash"
                        : "border-line bg-surface hover:border-accent"
                    }`}
                  >
                    <span className="block text-[14px] font-medium">
                      {r.titulo}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                      {r.detalle}
                    </span>
                  </button>
                ))}
              </div>

              <Field
                label="¿Para quién es? (opcional)"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ana"
                hint="Sólo para reconocer la invitación en esta lista."
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pendiente}
                  onClick={() =>
                    empezar(async () => {
                      const r = await invitar(rol, nombre);
                      setEstado(r);
                      if (!r.error) {
                        setInvitando(false);
                        setNombre("");
                      }
                    })
                  }
                >
                  {pendiente ? "Creando…" : "Crear la invitación"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setInvitando(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {estado?.error && (
            <p
              role="alert"
              className="rounded-[14px] bg-danger-wash px-3.5 py-2.5 text-[13.5px] text-danger"
            >
              {estado.error}
            </p>
          )}
        </CardBody>
      </Card>

      {invitaciones.length > 0 && (
        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>Invitaciones sin usar</CardTitle>
            <p className="-mt-2 text-[13.5px] leading-relaxed text-muted">
              Mandale el enlace por donde le escribas. Sirve una sola vez y
              vence en una semana. Tratalo como una llave: quien lo tenga entra.
            </p>

            <ul className="grid gap-4">
              {invitaciones.map((i) => (
                <li key={i.id} className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[14px] font-medium">
                      {i.label ?? "Sin nombre"}{" "}
                      <span className="font-normal text-muted">
                        · {NOMBRE_ROL[i.role]}
                      </span>
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendiente}
                      onClick={() =>
                        empezar(() => void cancelarInvitacion(i.id))
                      }
                    >
                      Cancelar
                    </Button>
                  </div>

                  <Copiable
                    label="Enlace"
                    valor={`${sitio}/unirse/${i.token}`}
                    hint={`Vence el ${new Date(i.expires_at).toLocaleDateString("es-AR")}.`}
                  />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
