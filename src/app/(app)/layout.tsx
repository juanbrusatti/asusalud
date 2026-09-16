import { Barra } from "@/app/_components/barra";
import { getCurrentTenant } from "@/lib/auth/tenant";

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

  return (
    <>
      {membership && <Barra tenantName={membership.tenant.name} />}
      {children}
    </>
  );
}
