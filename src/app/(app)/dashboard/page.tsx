import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { Receipt, ClipboardCheck, Wallet, Settings } from "lucide-react";
import Link from "next/link";

export default async function Dashboard() {
  const profile = await requireRole();
  const role = profile.role;

  const cards = [
    { href: "/gastos", label: "Mis gastos", desc: "Registra y revisa tus rendiciones", icon: Receipt, show: role !== "general_manager" },
    { href: "/fondos", label: "Fondos por rendir", desc: role === "general_manager" ? "Depósitos pendientes" : "Solicita y consulta tu saldo", icon: Wallet, show: true },
    { href: "/aprobaciones", label: "Aprobaciones", desc: "Solicitudes y rendiciones pendientes", icon: ClipboardCheck, show: role !== "employee" },
    { href: "/admin", label: "Administración", desc: "Usuarios, empresas, áreas y categorías", icon: Settings, show: role === "admin" },
  ].filter((c) => c.show);

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Hola, {profile.full_name.split(" ")[0]} 👋</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ingresaste como {ROLE_LABELS[role]}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-4 rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
          >
            <span className="rounded-xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
              <Icon size={22} />
            </span>
            <span>
              <span className="block font-semibold group-hover:text-primary">{label}</span>
              <span className="text-sm text-muted-foreground">{desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
