import { Card, CardBody, CardFigure, CardTitle } from "@/components/ui/card";
import { formatPrice, formatPriceExacto } from "@/lib/money";
import { COSTO_MENSAJE_META_CENTS, DIAS_PARA_PAGAR } from "@/lib/precio";
import { diasHasta, formatFecha, type Suscripcion } from "@/lib/suscripcion";
import { Pagar } from "./pagar";

/**
 * Tu cuenta, para quien está en el abono mensual.
 *
 * Lo primero es dónde está parada la cuenta y hasta cuándo, en una frase. El
 * botón de pago va siempre a la vista, también en la prueba y con el abono al
 * día: pagar antes no pierde días, se suman.
 */
export function CuentaSuscripcion({ s }: { s: Suscripcion }) {
  const abono = formatPrice(s.abono_cents ?? 0);

  const titulo = {
    prueba: "Mes de prueba",
    activa: "Abono al día",
    a_pagar: "Abono vencido",
    suspendida: "Cuenta suspendida",
    acuerdo: "",
  }[s.estado];

  const cifra =
    s.estado === "prueba"
      ? `${diasHasta(s.prueba_hasta)} días`
      : s.estado === "activa"
        ? formatFecha(s.pagado_hasta)
        : abono;

  const detalle = {
    prueba: `Te quedan hasta el ${formatFecha(s.prueba_hasta)}. Después son ${abono} cada 30 días.`,
    activa: `Tu cuenta está cubierta hasta esa fecha. Después son ${abono} cada 30 días.`,
    a_pagar: `Venció el ${formatFecha(s.pagado_hasta)}. Tenés hasta el ${formatFecha(s.gracia_hasta)} para pagarlo; después la cuenta se suspende.`,
    suspendida: `Venció el ${formatFecha(s.pagado_hasta)} y no se pagó. Están frenados los recordatorios, la reserva online y la autogestión. No se borró nada.`,
    acuerdo: "",
  }[s.estado];

  const urgente = s.estado === "a_pagar" || s.estado === "suspendida";

  return (
    <>
      <Card accent={!urgente}>
        <CardBody className={`grid gap-2 ${urgente ? "bg-warn-wash" : ""}`}>
          <p className={`text-[13px] uppercase tracking-wider ${urgente ? "text-warn" : "opacity-75"}`}>
            {titulo}
          </p>
          <CardFigure>{cifra}</CardFigure>
          <p className={`text-[14px] ${urgente ? "text-ink" : "opacity-90"}`}>{detalle}</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-3">
          <CardTitle>
            {s.estado === "suspendida" ? "Pagar y reactivar" : "Pagar el abono"}
          </CardTitle>
          <p className="text-[13.5px] leading-relaxed text-muted">
            {abono} por 30 días. Si pagás antes de que venza, se suma a lo que
            ya tenías: no perdés ningún día.
            {s.estado === "suspendida"
              ? " La cuenta vuelve a funcionar en cuanto entra el pago."
              : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Pagar abono etiqueta={`Pagar ${abono}`} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid gap-3">
          <CardTitle>Cómo funciona</CardTitle>
          <ul className="grid gap-2 text-[13.5px] leading-relaxed text-muted">
            <li>
              Los primeros 30 días desde que creaste la cuenta son gratis.
            </li>
            <li>
              Después son {abono} cada 30 días. Cuando vence, tenés{" "}
              {DIAS_PARA_PAGAR} días para pagarlo.
            </li>
            <li>
              Si pasan esos {DIAS_PARA_PAGAR} días sin pago, la cuenta se
              suspende: se frenan los recordatorios y la reserva online, pero no
              se borra nada. Al pagar, vuelve tal como estaba.
            </li>
            <li>
              Los mensajes de WhatsApp van aparte, también durante la prueba: los
              cobra Meta contra tu tarjeta, hoy{" "}
              {formatPriceExacto(COSTO_MENSAJE_META_CENTS)} cada uno.
            </li>
          </ul>
        </CardBody>
      </Card>

      {(s.pagos?.length ?? 0) > 0 && (
        <Card>
          <CardBody className="grid gap-3">
            <CardTitle>Pagos</CardTitle>
            <ul className="grid gap-1">
              {s.pagos!.map((p) => (
                <li
                  key={p.fecha}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b-[1.5px] border-line-soft py-2.5 last:border-0"
                >
                  <div>
                    <p className="text-[14.5px] font-medium">
                      {formatFecha(p.fecha)}
                    </p>
                    <p className="text-[13px] text-muted">
                      Cubre hasta el {formatFecha(p.cubre_hasta)} ·{" "}
                      {p.origen === "mercadopago" ? "Mercado Pago" : "registrado a mano"}
                    </p>
                  </div>
                  <p className="text-[14.5px] tabular-nums">
                    {formatPrice(p.pagado_cents)}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
