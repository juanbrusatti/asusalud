import { PantallaCargando } from "@/components/ui/esqueleto";

/**
 * Lo que se ve mientras carga cualquier pantalla con sesión.
 *
 * Next no puede mostrar nada de la pantalla nueva hasta que el servidor
 * conteste entera, salvo que haya un archivo como éste. Sin él, al tocar
 * «Agenda» no pasaba nada visible por un par de segundos y el clic parecía
 * perdido. Con él, el marco queda quieto, el contenido muestra su forma, y la
 * navegación se siente inmediata aunque el servidor tarde lo mismo.
 */
export default function Cargando() {
  return <PantallaCargando />;
}
