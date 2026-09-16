import Link from "next/link";

export function Volver() {
  return (
    <Link
      href="/configuracion"
      className="text-[13px] text-muted hover:text-ink"
    >
      ← Configuración
    </Link>
  );
}
