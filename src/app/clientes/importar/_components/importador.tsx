"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/ui/toggle";
import {
  FIELDS,
  FIELD_HINTS,
  FIELD_LABELS,
  guessMapping,
  type Field,
} from "@/lib/import/columns";
import { importClientsBatch, type ImportRow } from "@/lib/actions/import";

const LOTE = 500;

type Paso = "archivo" | "mapeo" | "importando" | "listo";

type Problema = { line: number; name: string; reason: string };

/**
 * Importador en tres pasos: elegir archivo, revisar qué columna es qué, y
 * confirmar. Nada se guarda hasta el último paso.
 *
 * El archivo se lee en el navegador: no viaja al servidor hasta que las
 * columnas están mapeadas, y se manda por lotes para poder mostrar el avance.
 */
export function Importador() {
  const router = useRouter();

  const [paso, setPaso] = useState<Paso>("archivo");
  const [error, setError] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, Field | null>>({});
  const [actualizar, setActualizar] = useState(false);

  const [progreso, setProgreso] = useState(0);
  const [resumen, setResumen] = useState({ created: 0, updated: 0, skipped: 0 });
  const [problemas, setProblemas] = useState<Problema[]>([]);

  async function leerArchivo(file: File) {
    setError(null);
    setNombreArchivo(file.name);

    try {
      let matriz: string[][];

      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        // El paquete no expone raíz: hay que pedir la variante del navegador.
        const readXlsxFile = (await import("read-excel-file/browser")).default;
        const filas = (await readXlsxFile(file)) as unknown as unknown[][];
        matriz = filas.map((fila) =>
          fila.map((celda) =>
            celda === null || celda === undefined ? "" : String(celda),
          ),
        );
      } else {
        const Papa = (await import("papaparse")).default;
        const texto = await file.text();
        const parsed = Papa.parse<string[]>(texto, { skipEmptyLines: true });
        matriz = parsed.data;
      }

      if (matriz.length < 2) {
        setError(
          "El archivo tiene que traer una fila de encabezados y al menos una persona.",
        );
        return;
      }

      const [cabecera, ...resto] = matriz;
      setHeaders(cabecera);
      setRows(resto.filter((f) => f.some((c) => c.trim() !== "")));
      setMapping(guessMapping(cabecera));
      setPaso("mapeo");
    } catch {
      setError(
        "No pudimos leer el archivo. Tiene que ser un .xlsx o un .csv exportado de tu sistema.",
      );
    }
  }

  const asignados = new Set(Object.values(mapping).filter(Boolean) as Field[]);
  const tieneNombre = asignados.has("firstName");

  function filaAObjeto(fila: string[]): ImportRow {
    const out: Record<string, string> = {};
    for (const [indexRaw, field] of Object.entries(mapping)) {
      if (!field) continue;
      const value = fila[Number(indexRaw)];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        out[field] = String(value).trim();
      }
    }
    return out as ImportRow;
  }

  async function importar() {
    setPaso("importando");
    setProgreso(0);

    const acumulado = { created: 0, updated: 0, skipped: 0 };
    const fallos: Problema[] = [];

    for (let i = 0; i < rows.length; i += LOTE) {
      const lote = rows.slice(i, i + LOTE).map(filaAObjeto);

      const r = await importClientsBatch(lote, {
        updateExisting: actualizar,
        // +2: la fila 1 son los encabezados y las planillas cuentan desde 1.
        startLine: i + 2,
      });

      acumulado.created += r.created;
      acumulado.updated += r.updated;
      acumulado.skipped += r.skipped;
      fallos.push(...r.problems);

      setProgreso(Math.min(i + LOTE, rows.length));
      setResumen({ ...acumulado });
      setProblemas([...fallos]);
    }

    setPaso("listo");
    router.refresh();
  }

  // -------------------------------------------------------------------------

  if (paso === "archivo") {
    return (
      <Card>
        <CardBody className="grid justify-items-start gap-4">
          <div className="grid gap-2">
            <p className="font-hand text-[38px] leading-none text-accent-text">
              Traé tu gente
            </p>
            <CardTitle>Subí el archivo que exportaste</CardTitle>
            <p className="max-w-prose text-[14.5px] leading-relaxed text-muted">
              Sirve un Excel (.xlsx) o un CSV. Vas a poder revisar qué es cada
              columna y ver un resumen antes de que se guarde nada.
            </p>
          </div>

          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,.xlsx,.xlsm,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void leerArchivo(file);
              }}
            />
            <span className="inline-flex h-13 items-center rounded-pill bg-accent px-7 text-base font-medium text-on-accent">
              Elegir archivo
            </span>
          </label>

          {error && (
            <p role="alert" className="text-[13.5px] text-danger">
              {error}
            </p>
          )}

          <p className="text-[12.5px] leading-snug text-faint">
            El archivo se lee en tu navegador. Sólo viajan los datos de las
            columnas que elijas, y recién cuando confirmes.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (paso === "mapeo") {
    return (
      <div className="grid gap-4">
        <Card>
          <CardBody className="grid gap-4">
            <div>
              <CardTitle>¿Qué es cada columna?</CardTitle>
              <p className="mt-1 text-[14.5px] text-muted">
                {nombreArchivo} · {rows.length.toLocaleString("es-AR")}{" "}
                {rows.length === 1 ? "persona" : "personas"}. Marcamos lo que
                reconocimos; revisá que esté bien.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b-[1.5px] border-line text-left">
                    <th className="py-2 pr-4 font-semibold">Columna</th>
                    <th className="py-2 pr-4 font-semibold">Ejemplo</th>
                    <th className="py-2 font-semibold">Se guarda como</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i} className="border-b border-line-soft">
                      <td className="py-2 pr-4 font-medium">{h || "(sin nombre)"}</td>
                      <td className="max-w-40 truncate py-2 pr-4 text-muted">
                        {rows[0]?.[i] || "—"}
                      </td>
                      <td className="py-2">
                        <select
                          value={mapping[i] ?? ""}
                          aria-label={`Qué guardar de la columna ${h}`}
                          onChange={(e) =>
                            setMapping({
                              ...mapping,
                              [i]: (e.target.value || null) as Field | null,
                            })
                          }
                          className="h-9 rounded-[12px] border-[1.5px] border-line bg-surface px-2.5 text-[13px]"
                        >
                          <option value="">No importar</option>
                          {FIELDS.map((f) => (
                            <option
                              key={f}
                              value={f}
                              disabled={asignados.has(f) && mapping[i] !== f}
                            >
                              {FIELD_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!tieneNombre && (
              <p
                role="alert"
                className="rounded-[14px] bg-warn-wash px-3.5 py-2.5 text-[13px] text-warn"
              >
                Falta decir cuál es la columna del <strong>nombre</strong>. Es
                lo único imprescindible.
              </p>
            )}

            <div className="grid gap-2 text-[12.5px] text-muted">
              {(Object.keys(FIELD_HINTS) as Field[])
                .filter((f) => asignados.has(f))
                .map((f) => (
                  <p key={f}>
                    <strong className="text-ink">{FIELD_LABELS[f]}:</strong>{" "}
                    {FIELD_HINTS[f]}
                  </p>
                ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-4">
            <CardTitle>Si alguien ya está cargado</CardTitle>
            <Toggle
              name="actualizar"
              label="Actualizar las fichas que ya existen"
              hint="Buscamos coincidencias por teléfono y por correo. Apagado, las repetidas se saltean y no se toca nada de lo que ya tenés."
              defaultChecked={actualizar}
              onChange={setActualizar}
            />
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" disabled={!tieneNombre} onClick={() => void importar()}>
            Importar {rows.length.toLocaleString("es-AR")}{" "}
            {rows.length === 1 ? "persona" : "personas"}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setPaso("archivo")}>
            Elegir otro archivo
          </Button>
        </div>
      </div>
    );
  }

  const total = rows.length;
  const porcentaje = total === 0 ? 100 : Math.round((progreso / total) * 100);

  return (
    <div className="grid gap-4">
      <Card accent={paso === "listo"}>
        <CardBody className="grid gap-3">
          {paso === "importando" ? (
            <>
              <CardTitle>Importando…</CardTitle>
              <div
                className="h-2 w-full overflow-hidden rounded-pill bg-surface-2"
                role="progressbar"
                aria-valuenow={porcentaje}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <p className="text-[14px] tabular-nums text-muted">
                {progreso.toLocaleString("es-AR")} de{" "}
                {total.toLocaleString("es-AR")}. No cierres esta pestaña.
              </p>
            </>
          ) : (
            <>
              <p className="font-hand text-[40px] leading-none">Listo</p>
              <CardTitle>Tus clientes ya están cargados</CardTitle>
            </>
          )}

          <dl className="mt-1 flex flex-wrap gap-x-8 gap-y-2 text-[14px] tabular-nums">
            <div>
              <dt className="text-[11.5px] uppercase tracking-wider opacity-70">
                Creadas
              </dt>
              <dd className="text-[20px] font-semibold">{resumen.created}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wider opacity-70">
                Actualizadas
              </dt>
              <dd className="text-[20px] font-semibold">{resumen.updated}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] uppercase tracking-wider opacity-70">
                Salteadas
              </dt>
              <dd className="text-[20px] font-semibold">{resumen.skipped}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {problemas.length > 0 && (
        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>
              {problemas.length}{" "}
              {problemas.length === 1 ? "fila a revisar" : "filas a revisar"}
            </CardTitle>
            <p className="text-[13.5px] text-muted">
              Ninguna de estas frenó la importación. Anotalas y corregilas
              después desde cada ficha.
            </p>
            <ul className="grid max-h-72 gap-1.5 overflow-y-auto text-[13px]">
              {problemas.slice(0, 200).map((p, i) => (
                <li key={i} className="border-b border-line-soft pb-1.5">
                  <span className="tabular-nums text-faint">Fila {p.line}</span>{" "}
                  {p.name && <strong>{p.name} · </strong>}
                  <span className="text-muted">{p.reason}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {paso === "listo" && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/clientes">Ver mis clientes</Link>
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setPaso("archivo")}>
            Importar otro archivo
          </Button>
        </div>
      )}
    </div>
  );
}
