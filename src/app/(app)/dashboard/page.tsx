import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { getPendingApprovalsSummary } from "@/lib/approvals-count";
import { Receipt, ClipboardCheck, Wallet, Settings, Clock } from "lucide-react";
import Link from "next/link";

export default async function Dashboard() {
  const profile = await requireRole();
  const role = profile.role;

  const approvalsSummary = await getPendingApprovalsSummary(role, profile.id);
  const pendingCount = approvalsSummary.total;

  const cards = [
    {
      href: "/gastos",
      label: "Mis gastos",
      desc: "Registra y revisa tus rendiciones",
      icon: Receipt,
      show: role !== "general_manager",
      badge: null,
      highlight: false,
    },
    {
      href: "/fondos",
      label: "Fondos por rendir",
      desc: role === "general_manager" ? "Depósitos pendientes" : "Solicita y consulta tu saldo",
      icon: Wallet,
      show: true,
      badge: null,
      highlight: false,
    },
    {
      href: "/aprobaciones",
      label: "Aprobaciones",
      desc:
        pendingCount > 0
          ? `${approvalsSummary.fundsCount > 0 ? `${approvalsSummary.fundsCount} fondo(s)` : ""} ${
              approvalsSummary.fundsCount > 0 && approvalsSummary.reportsCount > 0 ? "· " : ""
            }${approvalsSummary.reportsCount > 0 ? `${approvalsSummary.reportsCount} rendición(es)` : ""} esperando tu firma`
          : "Solicitudes y rendiciones pendientes",
      icon: ClipboardCheck,
      show: role !== "employee",
      badge:
        pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
            </span>
            {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
          </span>
        ) : null,
      highlight: pendingCount > 0,
    },
    {
      href: "/admin",
      label: "Administración",
      desc: "Usuarios, empresas, áreas y categorías",
      icon: Settings,
      show: role === "admin",
      badge: null,
      highlight: false,
    },
  ].filter((c) => c.show);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {profile.full_name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ingresaste como {ROLE_LABELS[role]}</p>
      </div>

      {pendingCount > 0 && (
        <Link
          href="/aprobaciones"
          className="flex items-center justify-between gap-4 rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 shadow-sm transition hover:border-amber-500 hover:shadow-md dark:border-amber-700/60 dark:from-amber-950/40"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-950 dark:text-amber-200">
                Tienes {pendingCount} solicitud{pendingCount > 1 ? "es" : ""} por revisar o autorizar
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-400/80">
                Haz clic aquí para ir directamente a la bandeja de Aprobaciones.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-600">
            Revisar ahora →
          </span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ href, label, desc, icon: Icon, badge, highlight }) => (
          <Link
            key={href}
            href={href}
            className={`group flex items-start gap-4 rounded-2xl border p-5 transition hover:shadow-sm ${
              highlight
                ? "border-amber-400 bg-amber-50/40 shadow-sm hover:border-amber-500 dark:border-amber-700/80 dark:bg-amber-950/20"
                : "border-border bg-surface hover:border-primary"
            }`}
          >
            <span
              className={`rounded-xl p-3 transition ${
                highlight
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-brand-50 text-brand-600 group-hover:bg-primary group-hover:text-white dark:bg-brand-900/30 dark:text-brand-300"
              }`}
            >
              <Icon size={22} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`block font-semibold ${
                    highlight ? "text-amber-950 dark:text-amber-200" : "group-hover:text-primary"
                  }`}
                >
                  {label}
                </span>
                {badge}
              </div>
              <span className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{desc}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
