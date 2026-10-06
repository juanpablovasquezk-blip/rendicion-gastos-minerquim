import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ExpenseForm } from "./expense-form";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getUserAuthorizedCompanies } from "@/lib/companies";

export default async function NuevoGastoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; fund_id?: string }>;
}) {
  const profile = await requireRole("employee", "manager", "admin");
  const { error, fund_id } = await searchParams;

  const sb = await createClient();

  // Cargar datos requeridos en paralelo
  const [companies, { data: departments }, { data: categories }, { data: receiptTypes }, { data: activeFunds }] =
    await Promise.all([
      getUserAuthorizedCompanies(sb, profile.id, profile.role),
      sb.from("departments").select("id, name, code").eq("is_active", true).order("name"),
      sb.from("categories").select("id, name").eq("is_active", true).order("name"),
      sb.from("receipt_types").select("id, name, code, requires_receipt").eq("is_active", true).order("name"),
      sb
        .from("cash_advances")
        .select("id, purpose, current_balance, companies(name)")
        .eq("user_id", profile.id)
        .eq("status", "active")
        .order("created_at", { ascending: false }),
    ]);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Link
          href="/gastos"
          className="rounded-xl border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Registrar Gasto</h1>
          <p className="text-sm text-muted-foreground">
            Ingresa los datos del comprobante o gasto para tu rendición
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ExpenseForm
        companies={companies}
        departments={departments ?? []}
        categories={categories ?? []}
        receiptTypes={receiptTypes ?? []}
        activeFunds={activeFunds ?? []}
        initialFundId={fund_id}
      />
    </section>
  );
}
