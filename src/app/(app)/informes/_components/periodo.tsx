import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PRESETS, PRESET_LABELS, type Range } from "@/lib/informes";

/**
 * Selector de período.
 *
 * Los atajos son enlaces y el rango libre es un formulario GET: sin una línea
 * de JavaScript, la pantalla se puede compartir por su dirección y el botón de
 * atrás del navegador hace lo que se espera.
 */
export function Periodo({ range }: { range: Range }) {
  return (
    <Card>
      <CardBody className="grid gap-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const activo = range.preset === p;
            return (
              <Link
                key={p}
                href={p === "mes" ? "/informes" : `/informes?preset=${p}`}
                aria-current={activo ? "page" : undefined}
                className={`rounded-pill border-[1.5px] px-3.5 py-1.5 text-[13px] font-medium ${
                  activo
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {PRESET_LABELS[p]}
              </Link>
            );
          })}
        </div>

        <form
          method="get"
          className="flex flex-wrap items-end gap-3 border-t-[1.5px] border-line pt-4"
        >
          <div className="grid gap-1.5">
            <label
              htmlFor="desde"
              className="text-[12.5px] font-medium text-muted"
            >
              Desde
            </label>
            <input
              id="desde"
              name="desde"
              type="date"
              defaultValue={range.from}
              required
              className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px] text-ink"
            />
          </div>

          <div className="grid gap-1.5">
            <label
              htmlFor="hasta"
              className="text-[12.5px] font-medium text-muted"
            >
              Hasta
            </label>
            <input
              id="hasta"
              name="hasta"
              type="date"
              defaultValue={range.to}
              required
              className="h-11 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 text-[15px] text-ink"
            />
          </div>

          <Button type="submit" variant="outline">
            Ver
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
