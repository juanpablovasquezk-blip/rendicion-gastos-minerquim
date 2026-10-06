import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  if (!profile.is_active) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold">Cuenta desactivada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu cuenta fue desactivada. Contacta al administrador del sistema.
        </p>
        <form action={signOut}>
          <button className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white">Cerrar sesión</button>
        </form>
      </main>
    );
  }

  return (
    <AppShell role={profile.role} name={profile.full_name} email={profile.email}>
      {children}
    </AppShell>
  );
}
