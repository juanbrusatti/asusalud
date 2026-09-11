import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { NavLink } from "./nav-link";

/**
 * Barra superior en píldora flotante. Los módulos se van sumando acá a medida
 * que avanzan las fases.
 */
export function Barra({ tenantName }: { tenantName: string }) {
  return (
    <header className="sticky top-3 z-20 mx-auto w-full max-w-4xl px-4">
      <div className="flex items-center gap-2 rounded-pill border-[1.5px] border-line bg-surface px-3 py-2 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.25)]">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5"
          aria-label={`${tenantName}, ir al inicio`}
        >
          <Logo className="h-8 w-8 shrink-0" />
          <span className="hidden truncate text-[14.5px] font-semibold sm:block">
            {tenantName}
          </span>
        </Link>

        <nav
          aria-label="Secciones"
          className="ml-auto flex items-center gap-1 overflow-x-auto"
        >
          <NavLink href="/">Inicio</NavLink>
          <NavLink href="/clientes">Clientes</NavLink>
          <NavLink href="/servicios">Servicios</NavLink>
        </nav>

        <form action={signOut} className="shrink-0">
          <Button type="submit" variant="ghost" size="sm">
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
