"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Home,
  LogOut,
  Plus,
  Receipt,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { signOut } from "@/app/login/actions";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  desktopOnly?: boolean;
};

const ALL: UserRole[] = ["employee", "manager", "admin", "general_manager"];

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: Home, roles: ALL },
  { href: "/gastos", label: "Gastos", icon: Receipt, roles: ["employee", "manager", "admin"] },
  { href: "/fondos", label: "Fondos", icon: Wallet, roles: ALL },
  { href: "/aprobaciones", label: "Aprobaciones", icon: ClipboardCheck, roles: ["manager", "admin", "general_manager"] },
  { href: "/admin", label: "Administración", icon: Settings, roles: ["admin"], desktopOnly: true },
];

type Props = { role: UserRole; name: string; email: string; children: React.ReactNode };

export function AppShell({ role, name, email, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const items = NAV.filter((n) => n.roles.includes(role));
  const mobileItems = items.filter((n) => !n.desktopOnly).slice(0, 4);
  const half = Math.ceil(mobileItems.length / 2);
  const canCreateExpense = role !== "general_manager";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex min-h-dvh">
      {/* ===== Escritorio: sidebar colapsable ===== */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <Image src="/brand/app-icon.png" alt="" width={36} height={36} className="rounded-lg" />
          {!collapsed && <span className="font-display text-base font-bold leading-tight">Rendición de Gastos</span>}
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive(href)
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && label}
            </Link>
          ))}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          {!collapsed && (
            <div className="px-2">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
            </div>
          )}
          <form action={signOut}>
            <button
              title="Cerrar sesión"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut size={20} className="shrink-0" />
              {!collapsed && "Cerrar sesión"}
            </button>
          </form>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted"
          >
            {collapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
            {!collapsed && "Contraer"}
          </button>
        </div>
      </aside>

      {/* ===== Contenido ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur md:h-16 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Image src="/brand/app-icon.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="font-display font-bold">Rendición</span>
          </div>
          <p className="hidden text-sm text-muted-foreground md:block">
            Hola, <span className="font-semibold text-foreground">{name}</span> · {email}
          </p>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle compact />
            <form action={signOut} className="md:hidden">
              <button aria-label="Cerrar sesión" className="rounded-full border border-border bg-surface p-2">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>

      {/* ===== Móvil: barra inferior + botón flotante ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="relative mx-auto grid max-w-md grid-cols-5 items-end">
          {mobileItems.slice(0, half).map((n) => (
            <BottomLink key={n.href} item={n} active={isActive(n.href)} />
          ))}
          {mobileItems.length < 4 && <li />}
          <li className="flex justify-center">
            {canCreateExpense && (
              <Link
                href="/gastos/nuevo"
                aria-label="Nuevo gasto"
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-4 ring-background transition active:scale-95"
              >
                <Plus size={28} strokeWidth={3} />
              </Link>
            )}
          </li>
          {mobileItems.slice(half).map((n) => (
            <BottomLink key={n.href} item={n} active={isActive(n.href)} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <Icon size={22} />
        {item.label}
      </Link>
    </li>
  );
}
