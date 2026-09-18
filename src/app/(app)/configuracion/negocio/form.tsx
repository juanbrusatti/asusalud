"use client";

import { useActionState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { saveEstetica, type FormState } from "@/lib/actions/configuracion";
import { TIMEZONES, type Branch, type Tenant } from "@/lib/configuracion";
import { Guardar, Resultado } from "../_components/guardar";
import { useRefrescarAlGuardar } from "../_components/refrescar";

const INITIAL: FormState = { error: null };

export function FormEstetica({
  tenant,
  branch,
}: {
  tenant: Tenant;
  branch: Branch | null;
}) {
  const [state, action] = useActionState(saveEstetica, INITIAL);
  useRefrescarAlGuardar(state.notice);

  return (
    <form action={action} className="grid gap-4">
      <Card>
        <CardBody className="grid gap-5">
          <Field
            label="Nombre"
            name="name"
            required
            defaultValue={tenant.name}
            hint="Es el que ven tus clientes al reservar y el que firma los recordatorios."
          />

          <Select
            label="Zona horaria"
            name="timezone"
            defaultValue={tenant.timezone}
            hint="Define a qué hora empieza y termina cada día, y cuándo sale cada recordatorio. Si está mal, los turnos aparecen en el día equivocado."
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-5">
          <Field
            label="Dirección"
            name="address"
            defaultValue={branch?.address ?? ""}
            placeholder="Santiago del Estero 1130, Río Cuarto"
          />
          <Field
            label="Teléfono del local"
            name="phone"
            type="tel"
            defaultValue={branch?.phone ?? ""}
            hint="El del negocio, no el de tus clientes."
          />
        </CardBody>
      </Card>

      <Resultado state={state} />

      <div className="flex">
        <Guardar />
      </div>
    </form>
  );
}
