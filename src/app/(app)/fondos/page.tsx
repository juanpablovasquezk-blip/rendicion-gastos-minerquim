import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatClp, formatDate, FUND_STATUS_CONFIG, REPORT_STATUS_CONFIG } from "@/lib/format";
import { NewFundModal } from "./new-fund-modal";
import { cancelFund } from "./actions";
import { Wallet, AlertCircle, CheckCircle2, FileText, ArrowUpRight, Ban, HandCoins, Plus, Clock } from "lucide-react";
import Link from "next/link";
import { getSignedFileUrl } from "@/lib/supabase/storage";
import { getUserAuthorizedCompanies } from "@/lib/companies";

export default async function FondosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; tab?: string }>;
}) {
  const profile = await requireRole();
  const { error, success, tab } = await searchParams;
  const currentTab = tab || "fondos";

  const sb = await createClient();

  // 1. Obtener empresas autorizadas para el usuario
  const companies = await getUserAuthorizedCompanies(sb, profile.id, profile.role);

  // 2. Obtener fondos del usuario
  const { data: funds } = await sb
    .from("cash_advances")
    .select("*, companies(name)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  // 3. Obtener reembolsos de dinero personal del usuario
  const { data: reimbursements } = await sb
    .from("expense_reports")
    .select(`
      *,
      expenses(
        id, date, supplier_name, supplier_rut, invoice_number,
        total_amount, tax_amount, has_receipt, description, status,
        companies(name), departments(name), categories(name), receipt_types(name)
      )
    `)
    .eq("user_id", profile.id)
    .eq("report_type", "reimbursement")
    .order("created_at", { ascending: false });

  // Calcular métricas de los fondos del usuario
  const activeFunds = funds?.filter((f) => f.status === "active") ?? [];
  const requestedFunds = funds?.filter((f) => f.status === "requested" || f.status === "approved") ?? [];

  const totalAvailableBalance = activeFunds.reduce((acc, f) => acc + Number(f.current_balance || 0), 0);
  const totalPendingAmount = requestedFunds.reduce((acc, f) => acc + Number(f.requested_amount || 0), 0);

  // Calcular reembolsos a favor del colaborador
  const pendingReimbursements = reimbursements?.filter((r) => r.status === "submitted" || r.status === "partially_approved") ?? [];
  const approvedReimbursements = reimbursements?.filter((r) => r.status === "approved") ?? [];
  const totalReimbursementOwed = [...pendingReimbursements, ...approvedReimbursements].reduce(
    (acc, r) => acc + Number(r.total_amount || 0),
    0
  );

  // Obtener URLs firmadas de comprobantes de depósito si los hay
  const depositUrls: Record<string, string | null> = {};
  if (funds) {
    await Promise.all(
      funds
        .filter((f) => f.deposit_receipt_path)
        .map(async (f) => {
          depositUrls[f.id] = await getSignedFileUrl("deposits", f.deposit_receipt_path);
        })
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado y botón de acción */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fondos y Reembolsos</h1>
          <p className="text-sm text-muted-foreground">
            Consulta tus saldos corporativos disponibles y el dinero a tu favor por reembolsos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/gastos/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs font-bold text-foreground shadow-sm transition hover:border-primary hover:text-primary active:scale-95"
          >
            <Plus size={16} />
            Rendir Gasto / Reembolso
          </Link>
          <NewFundModal companies={companies} />
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success === "solicitud_creada" && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>Solicitud de fondo enviada con éxito. Será evaluada por Gerencia de Operaciones.</span>
        </div>
      )}
      {success === "solicitud_cancelada" && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>La solicitud fue cancelada.</span>
        </div>
      )}

      {/* Resumen numérico: 3 tarjetas balanceadas */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* 1. Saldo de Fondos Activos (Empresa -> Colaborador) */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Saldo Fondos Activos
            </span>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Wallet size={20} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
            {formatClp(totalAvailableBalance)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeFunds.length} {activeFunds.length === 1 ? "fondo listo para rendir" : "fondos listos para rendir"}
          </p>
        </div>

        {/* 2. Reembolsos a Favor del Trabajador (Empresa DEBE al Colaborador) */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
              Reembolsos a tu Favor
            </span>
            <span className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              <HandCoins size={20} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-blue-900 dark:text-blue-200">
            {formatClp(totalReimbursementOwed)}
          </p>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-300 font-medium">
            Dinero personal por devolverte ({pendingReimbursements.length + approvedReimbursements.length} en curso)
          </p>
        </div>

        {/* 3. Anticipos en Solicitud */}
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Anticipos por Depositar
            </span>
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
              <ArrowUpRight size={20} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
            {formatClp(totalPendingAmount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {requestedFunds.length} {requestedFunds.length === 1 ? "solicitud en trámite" : "solicitudes en trámite"}
          </p>
        </div>
      </div>

      {/* Pestañas de navegación de listados */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Link
          href="/fondos?tab=fondos"
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
            currentTab === "fondos"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Wallet size={16} />
          Fondos por Rendir ({funds?.length ?? 0})
        </Link>
        <Link
          href="/fondos?tab=reembolsos"
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
            currentTab === "reembolsos"
              ? "bg-primary text-white shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <HandCoins size={16} />
          Mis Reembolsos de Dinero Personal ({reimbursements?.length ?? 0})
        </Link>
      </div>

      {/* TAB 1: FONDOS POR RENDIR */}
      {currentTab === "fondos" && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Mis Solicitudes y Fondos ({funds?.length ?? 0})</h2>
            <span className="text-xs text-muted-foreground">Dinero entregado por la empresa para operar</span>
          </div>

          {!funds || funds.length === 0 ? (
            <div className="py-12 text-center">
              <Wallet size={40} className="mx-auto text-muted-foreground/50" />
              <p className="mt-3 font-semibold">No tienes fondos registrados</p>
              <p className="text-sm text-muted-foreground">
                Haz clic en &quot;Solicitar Fondo&quot; para pedir un anticipo para tus gastos operativos.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {funds.map((fund) => {
                const statusCfg = FUND_STATUS_CONFIG[fund.status] || {
                  label: fund.status,
                  bg: "bg-gray-100",
                  text: "text-gray-700",
                };
                const hasDepositReceipt = !!depositUrls[fund.id];

                return (
                  <div key={fund.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {fund.companies?.name || "Empresa no especificada"}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}
                        >
                          {statusCfg.label}
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {fund.purpose}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Solicitado: {formatDate(fund.created_at)}</span>
                        {fund.date_assigned && <span>Depositado: {formatDate(fund.date_assigned)}</span>}
                      </div>

                      {fund.rejection_reason && (
                        <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          <strong>Motivo rechazo:</strong> {fund.rejection_reason}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                      <div className="text-left sm:text-right">
                        {fund.status === "active" ? (
                          <>
                            <span className="block text-xs font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                              Saldo Disponible
                            </span>
                            <span className="text-lg font-bold text-foreground">
                              {formatClp(fund.current_balance)}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              de {formatClp(fund.initial_amount)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block text-xs font-semibold uppercase text-muted-foreground">
                              Monto Solicitado
                            </span>
                            <span className="text-lg font-bold text-foreground">
                              {formatClp(fund.requested_amount)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Acciones contextuales */}
                      <div className="flex items-center gap-2">
                        {hasDepositReceipt && (
                          <a
                            href={depositUrls[fund.id]!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                          >
                            <FileText size={14} />
                            Comprobante Depósito
                          </a>
                        )}

                        {fund.status === "active" && (
                          <Link
                            href={`/gastos/nuevo?fund_id=${fund.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600"
                          >
                            Rendir Gasto
                          </Link>
                        )}

                        {fund.status === "requested" && (
                          <form action={cancelFund}>
                            <input type="hidden" name="id" value={fund.id} />
                            <button
                              type="submit"
                              title="Cancelar solicitud"
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            >
                              <Ban size={14} />
                              Cancelar
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REEMBOLSOS DE DINERO PERSONAL */}
      {currentTab === "reembolsos" && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">Mis Reembolsos de Dinero Personal ({reimbursements?.length ?? 0})</h2>
              <p className="text-xs text-muted-foreground">
                Gastos pagados con tu dinero personal que la empresa te debe reembolsar.
              </p>
            </div>
            <Link
              href="/gastos/nuevo"
              className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow transition hover:bg-blue-700"
            >
              <Plus size={14} />
              Nuevo Reembolso
            </Link>
          </div>

          {!reimbursements || reimbursements.length === 0 ? (
            <div className="py-12 text-center">
              <HandCoins size={40} className="mx-auto text-muted-foreground/50" />
              <p className="mt-3 font-semibold">No tienes reembolsos registrados</p>
              <p className="text-sm text-muted-foreground">
                Cuando pagues un gasto con tu dinero personal, regístralo como &quot;Reembolso Posterior&quot; para solicitar la devolución.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {reimbursements.map((rep) => {
                const statusCfg = REPORT_STATUS_CONFIG[rep.status] || {
                  label: rep.status,
                  bg: "bg-gray-100",
                  text: "text-gray-700",
                };
                const itemCount = rep.expenses?.length || 0;

                return (
                  <div key={rep.id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{rep.title}</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                          {statusCfg.label}
                        </span>
                        <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          Reembolso Directo
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Creado: {formatDate(rep.created_at)}</span>
                        <span>{itemCount} {itemCount === 1 ? "gasto ingresado" : "gastos ingresados"}</span>
                        {rep.expenses?.[0]?.supplier_name && (
                          <span>Proveedor: {rep.expenses[0].supplier_name}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                      <div className="text-left sm:text-right">
                        <span className="block text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">
                          Monto a Devolver
                        </span>
                        <span className="text-lg font-bold text-foreground">
                          {formatClp(rep.total_amount)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href="/gastos"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"
                        >
                          Ver en Rendiciones
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
