import { Barra } from "@/app/_components/barra";
import { AvisoSuscripcion } from "@/app/_components/suscripcion/aviso";
import { MuroSuspension } from "@/app/_components/suscripcion/muro";
import { atLeast, getCurrentTenant } from "@/lib/auth/tenant";
import { getSuscripcion } from "@/lib/data/suscripcion";
import { formatFecha } from "@/lib/suscripcion";

/**
 * El marco de las pantallas con sesión.
 *
 * La barra vivía dentro de cada página, y eso tenía un costo que no se veía en
 * ningún número: al navegar, Next no puede mostrar nada de la pantalla nueva
 * hasta que el servidor conteste entera. Con la barra acá arriba, el marco se
 * queda quieto y sólo el contenido espera, que es lo que permite mostrar el
 * esqueleto de carga sin que parpadee la navegación.
 *
 * `getCurrentTenant()` está memorizado por render, así que las páginas que lo
 * vuelven a pedir no gastan una consulta más.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const membership = await getCurrentTenant();
  const suscripcion = membership
    ? await getSuscripcion(membership.tenant.id)
    : null;
  const paga = membership ? atLeast(membership.role, "admin") : false;

  return (
    <>
      {membership && <Barra tenantName={membership.tenant.name} />}
      {suscripcion && paga && <AvisoSuscripcion s={suscripcion} />}
      <MuroSuspension
        activo={suscripcion?.estado === "suspendida"}
        puedePagar={paga}
        hasta={formatFecha(suscripcion?.pagado_hasta)}
      >
        {children}
      </MuroSuspension>
    </>
  );
}
