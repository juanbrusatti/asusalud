/**
 * Barra de proporción. Un porcentaje se lee más rápido de un vistazo que de un
 * número, y al lado del número se lee mejor que solo.
 */
export function Proporcion({
  value,
  total,
  tone = "accent",
  label,
}: {
  value: number;
  total: number;
  tone?: "accent" | "danger" | "muted";
  label: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const fill =
    tone === "danger" ? "bg-danger" : tone === "muted" ? "bg-ink" : "bg-accent";

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-pill bg-surface-2"
      role="img"
      aria-label={label}
    >
      <div className={`h-full rounded-pill ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
