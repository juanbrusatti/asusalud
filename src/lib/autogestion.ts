/**
 * El turno visto desde su propio enlace.
 *
 * Separado de `lib/data` porque la pantalla es un componente de cliente y no
 * puede arrastrar `next/headers` al navegador.
 */

export type ManageStatus =
  | "pending"
  | "confirmed"
  | "attended"
  | "no_show"
  | "cancelled";

/** Por qué no se puede tocar el turno. Null significa que sí se puede. */
export type ManageBlock = "cancelado" | "pasado" | "cerrado" | "tarde" | "limite";

export type ManageView = {
  tenant: {
    name: string;
    slug: string;
    timezone: string;
    phone: string | null;
  };
  appointment: {
    startsAt: string;
    endsAt: string;
    status: ManageStatus;
    priceCents: number | null;
    firstName: string | null;
    services: Array<{ name: string; minutes: number }>;
  };
  can: { confirm: boolean; cancel: boolean; reschedule: boolean };
  why: ManageBlock | null;
  /** Si la agenda pública está abierta, para ofrecerle sacar otro turno. */
  bookingOpen: boolean;
  cancelMinHours: number;
  reschedulesLeft: number;
};

/**
 * Qué se le dice al cliente cuando no puede hacer el cambio por su cuenta.
 *
 * Ninguno de estos textos termina en "no se puede" a secas: quien abre el
 * enlace tiene un problema concreto —no puede ir el jueves— y cerrarle la
 * puerta sin decirle por dónde salir lo único que logra es que escriba igual,
 * más tarde y de peor humor.
 */
export function blockMessage(
  why: ManageBlock,
  cancelMinHours: number,
): { title: string; detail: string } {
  switch (why) {
    case "cancelado":
      return {
        title: "Este turno está cancelado",
        detail: "Si querés volver a sacarlo, elegí un horario nuevo.",
      };
    case "pasado":
      return {
        title: "Este turno ya pasó",
        detail: "Podés sacar uno nuevo cuando quieras.",
      };
    case "cerrado":
      return {
        title: "Los cambios se hacen hablando",
        detail:
          "Este negocio prefiere que le avises directamente si no podés venir.",
      };
    case "tarde":
      return {
        title: "Ya falta poco para el turno",
        detail: `Los cambios por acá se hacen con más de ${cancelMinHours} ${
          cancelMinHours === 1 ? "hora" : "horas"
        } de anticipación. Si no podés venir, avisá igual: cuanto antes se sepa, más chances hay de que alguien más ocupe el lugar.`,
      };
    case "limite":
      return {
        title: "Ya moviste este turno varias veces",
        detail:
          "Para cambiarlo de nuevo hace falta hablarlo, así se busca un horario que te sirva de verdad.",
      };
  }
}

/** Los próximos días que se le ofrecen para mover el turno. */
export function nextDays(from: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
