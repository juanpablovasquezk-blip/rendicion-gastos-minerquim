import Image from "next/image";
import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Ingresar | Rendición de Gastos" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <Image src="/brand/logo-minerquim.jpg" alt="Grupo Minerquim" width={220} height={70} priority />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Rendición de Gastos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ingresa con la cuenta que te entregó el administrador</p>
        </div>
        <LoginForm />
        <ThemeToggle />
      </div>
    </main>
  );
}
