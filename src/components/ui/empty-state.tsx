import type { ReactNode } from "react";
import { Card, CardBody } from "@/components/ui/card";

/**
 * Los estados vacíos explican qué es esta sección y qué gana el negocio
 * usándola. Quien entra por primera vez tiene que entenderlo sin que nadie se
 * lo cuente.
 */
export function EmptyState({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardBody className="grid justify-items-start gap-3">
        <p className="font-hand text-[38px] leading-none text-accent-text">
          {eyebrow}
        </p>
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <div className="max-w-prose text-[14.5px] leading-relaxed text-muted">
          {children}
        </div>
        {action && <div className="mt-1">{action}</div>}
      </CardBody>
    </Card>
  );
}
