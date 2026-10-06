import { requireRole } from "@/lib/auth";
import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");
  return (
    <section className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">Administración</h1>
      <p className="mt-1 text-sm text-muted-foreground">Configura empresas, áreas, categorías y usuarios del sistema.</p>
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </section>
  );
}
