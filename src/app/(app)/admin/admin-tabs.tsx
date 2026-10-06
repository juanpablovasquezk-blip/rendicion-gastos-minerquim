"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/areas", label: "Áreas y centros de costo" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/comprobantes", label: "Tipos de comprobante" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mt-4 flex gap-1 overflow-x-auto border-b border-border pb-px">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
              active ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
