import Link from "next/link";
import { formatPrice } from "@/lib/money";
import { diasHasta, formatFecha, type Suscripcion } from "@/lib/suscripcion";

/**
 * Lo que la dueña tiene que saber de su abono, arriba de todo.
 *
 * Se dice con tiempo y sin alarma mientras no hay nada urgente, y claro
 * cuando lo hay. Un aviso que grita desde el primer día se aprende a no
 * mirar, y el día que importa ya nadie lo lee.
 *
 * Sólo a quien paga: a una profesional del equipo no le sirve de nada saber
 * que la prueba termina el jueves.
 */
export function AvisoSuscripcion({ s }: { s: Suscripcion }) {
  if (s.plan !== "suscripcion") return null;

  const abono = formatPrice(s.abono_cents ?? 0);
  let texto: React.ReactNode = null;
  let urgente = false;

  if (s.estado === "prueba") {
    const dias = diasHasta(s.prueba_hasta);
    texto = (
      <>
        Estás en tu mes de prueba: {dias === 1 ? "te queda 1 día" : `te quedan ${dias} días`}.
        Después son {abono} por mes.
      </>
    );
  } else if (s.estado === "activa") {
    const dias = diasHasta(s.pagado_hasta);
    if (dias > 5) return null;
    texto = (
      <>
        Tu abono vence el {formatFecha(s.pagado_hasta)}. Lo podés pagar desde
        ya y no se pierde ningún día.
      </>
    );
  } else if (s.estado === "a_pagar") {
    urgente = true;
    texto = (
      <>
        Tu abono venció el {formatFecha(s.pagado_hasta)}. Tenés hasta el{" "}
        {formatFecha(s.gracia_hasta)} para pagarlo: después la cuenta se
        suspende. No se borra nada.
      </>
    );
  } else {
    return null;
  }

  return (
    <div className="mx-auto mt-3 w-full max-w-4xl px-4">
      <div
        role={urgente ? "alert" : "status"}
        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border-[1.5px] px-4 py-3 text-[13.5px] leading-relaxed ${
          urgente
            ? "border-warn bg-warn-wash text-ink"
            : "border-line bg-surface text-muted"
        }`}
      >
        <p className="min-w-0 flex-1">{texto}</p>
        <Link
          href="/configuracion/cuenta"
          className="shrink-0 font-semibold text-accent-text hover:underline"
        >
          {s.estado === "prueba" ? "Ver mi cuenta" : "Pagar"}
        </Link>
      </div>
    </div>
  );
}
