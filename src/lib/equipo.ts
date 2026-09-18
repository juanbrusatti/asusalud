/** El equipo de un negocio: formas y nombres, para las dos orillas. */

export type RolEquipo = "owner" | "admin" | "reception" | "staff";

export type Miembro = {
  user_id: string;
  nombre: string;
  correo: string;
  rol: RolEquipo;
  desde: string;
  soy_yo: boolean;
};

export type Invitacion = {
  id: string;
  role: RolEquipo;
  label: string | null;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

/** Los que se pueden repartir. Al titular no se lo invita: se es. */
export const ROLES_INVITABLES = [
  {
    valor: "admin" as const,
    titulo: "Administración",
    detalle: "Ve y cambia todo, menos dar de baja el negocio.",
  },
  {
    valor: "reception" as const,
    titulo: "Recepción",
    detalle: "Agenda, clientes y caja. No toca precios ni configuración.",
  },
  {
    valor: "staff" as const,
    titulo: "Profesional",
    detalle: "Su agenda y las fichas. No ve la caja ni la cuenta.",
  },
];

export const NOMBRE_ROL: Record<RolEquipo, string> = {
  owner: "Titular",
  admin: "Administración",
  reception: "Recepción",
  staff: "Profesional",
};
