import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { todayIn } from "@/lib/tz";
import { Volver } from "../_components/volver";

export const metadata: Metadata = { title: "Tus datos" };

/**
 * Llevarse los datos.
 *
 * Existe por dos razones y las dos importan. Los términos prometen treinta
 * días para descargar lo que uno quiera conservar, y una promesa que el
 * sistema no puede cumplir es peor que no haberla hecho. Y porque le vendemos
 * a negocios que acaban de irse de otro sistema: el día que pregunten «¿y si
 * me quiero ir?», la respuesta tiene que ser un botón y no una charla.
 */
export default async function DatosPage() {
  const membership = await getCurrentTenant();
  if (!membership) return null;
  if (!atLeast(membership.role, "reception")) notFound();

  const hoy = todayIn(membership.tenant.timezone);
  const primero = `${hoy.slice(0, 7)}-01`;

  return (
    <main className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
      <div>
        <Volver />
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em]">
          Tus datos
        </h1>
        <p className="mt-1 max-w-prose text-[14.5px] text-muted">
          Todo lo que cargaste es tuyo y te lo podés llevar cuando quieras. Los
          archivos se abren con Excel.
        </p>
      </div>

      <Card>
        <CardBody className="grid gap-3">
          <CardTitle>Tus clientes</CardTitle>
          <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
            La libreta entera: nombre, teléfono, correo, documento, cumpleaños y
            el aviso de cada ficha. Es el mismo formato que acepta la
            importación, así que sirve para mudarse a cualquier lado.
          </p>
          <div className="flex">
            <Button asChild variant="outline">
              <a href="/exportar/clientes" download>
                Descargar clientes
              </a>
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-4">
          <CardTitle>Tus turnos</CardTitle>
          <p className="max-w-prose text-[13.5px] leading-relaxed text-muted">
            Quién, cuándo, qué se le hizo, en qué estado quedó y cuánto salió.
            Sirve para el historial y para pasarle el mes al contador.
          </p>

          {/* Un formulario de los de toda la vida: va directo al archivo, sin
              pasar por ningún estado intermedio ni por JavaScript. */}
          <form
            action="/exportar/turnos"
            method="get"
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <div className="grid gap-1.5">
              <label htmlFor="desde" className="text-[13.5px] font-medium">
                Desde
              </label>
              <input
                id="desde"
                name="desde"
                type="date"
                required
                defaultValue={primero}
                className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="hasta" className="text-[13.5px] font-medium">
                Hasta
              </label>
              <input
                id="hasta"
                name="hasta"
                type="date"
                required
                defaultValue={hoy}
                className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px]"
              />
            </div>

            <Button type="submit" variant="outline">
              Descargar
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="px-1 text-[12.5px] leading-relaxed text-faint">
        Los archivos se arman con punto y coma, que es lo que espera Excel en
        castellano. Si los abrís con otra herramienta y ves todo en una sola
        columna, elegí «punto y coma» como separador.
      </p>
    </main>
  );
}
