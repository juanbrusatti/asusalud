import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-5 py-12">
      <header className="grid gap-4">
        <Logo className="h-11 w-11" />
        <div>
          <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.035em]">
            Entrá a{" "}
            <span className="font-hand text-[40px] leading-none text-accent-text">
              Dlay
            </span>
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            La agenda, los clientes y los recordatorios de tu estética, en un
            solo lugar.
          </p>
        </div>
      </header>

      <AuthForm />
    </main>
  );
}
