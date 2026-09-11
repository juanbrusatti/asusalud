import { Card, CardBody, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Sin conexión" };

export default function SinConexionPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5">
      <Card>
        <CardBody className="grid gap-3 text-center">
          <p className="font-hand text-5xl leading-none text-accent-text">
            Sin señal
          </p>
          <CardTitle>No hay conexión en este momento</CardTitle>
          <p className="text-[14.5px] leading-relaxed text-muted">
            Dlay necesita internet para mostrar la agenda actualizada. En cuanto
            vuelva la conexión, recargá la página.
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
