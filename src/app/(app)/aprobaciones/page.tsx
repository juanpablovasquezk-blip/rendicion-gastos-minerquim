import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatClp, formatDate, FUND_STATUS_CONFIG, REPORT_STATUS_CONFIG } from "@/lib/format";
import { ApproveFundModal, DepositFundModal, RejectFundModal, ExpenseApprovalItem, SettleReimbursementModal } from "./approval-components";
import { resolveReport } from "./actions";
import { ClipboardCheck, Wallet, Receipt, History, AlertCircle, CheckCircle2 } from "lucide-react";
import { getSignedFileUrl } from "@/lib/supabase/storage";

export default async function AprobacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; tab?: string }>;
}) {
  const profile = await requireRole("admin", "general_manager", "manager");
  const { error, success, tab } = await searchParams;
  const currentTab = tab || "fondos";

  const sb = await createClient();

  // 1. Cargar Solicitudes de Fondos
  const { data: pendingFunds } = await sb
    .from("cash_advances")
    .select(`
      *,
      companies(name),
      departments(name),
      user_profile:user_id(id, full_name, email, phone)
    `)
    .in("status", ["requested", "approved"])
    .order("created_at", { ascending: false });

  // 2. Cargar Informes de Gastos enviados a revisión y reembolsos aprobados por pagar
  const { data: submittedReports } = await sb
    .from("expense_reports")
    .select(`
      *,
      user_profile:user_id(id, full_name, email),
      cash_advances(purpose, initial_amount, current_balance),
      expenses(
        id, date, supplier_name, supplier_rut, invoice_number,
        total_amount, tax_amount, has_receipt, receipt_path, is_duplicate_flag,
        description, justification, status, rejection_reason,
        companies(name), departments(name), categories(name), receipt_types(name)
      )
    `)
    .in("status", ["submitted", "partially_approved", "approved"])
    .order("created_at", { ascending: false });

  // 3. Cargar Historial reciente de aprobaciones
  const { data: historyLogs } = await sb
    .from("approval_history")
    .select(`
      *,
      approver:approver_id(full_name, email),
      subject:subject_user_id(full_name, email)
    `)
    .order("created_at", { ascending: false })
    .limit(25);

  // Obtener URLs firmadas de comprobantes de gastos
  const receiptUrls: Record<string, string | null> = {};
  if (submittedReports) {
    const allExpenses = submittedReports.flatMap((r) => r.expenses || []);
    await Promise.all(
      allExpenses
        .filter((e) => e.receipt_path)
        .map(async (e) => {
          receiptUrls[e.id] = await getSignedFileUrl("receipts", e.receipt_path);
        })
    );
  }

  // Filtrar fondos según rol y etapa
  const isOperaciones = profile.role === "admin";
  const isGerenciaGeneral = profile.role === "general_manager" || profile.role === "admin";

  const fondosPorRevisarOperaciones = pendingFunds?.filter(
    (f) => f.status === "requested" && (f.approval_stage === "admin" || f.approval_stage === "manager")
  ) ?? [];

  const fondosPorDepositarGM = pendingFunds?.filter(
    (f) => f.status === "approved" || f.approval_stage === "general_manager"
  ) ?? [];

  // Filtrar rendiciones e informes
  const rendicionesPorRevisar = submittedReports?.filter(
    (r) => r.status === "submitted" || r.status === "partially_approved"
  ) ?? [];

  const reembolsosPorPagarGM = submittedReports?.filter(
    (r) => r.status === "approved" && r.report_type === "reimbursement"
  ) ?? [];

  const totalRendicionesCount = rendicionesPorRevisar.length + reembolsosPorPagarGM.length;

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold">Bandeja de Aprobaciones</h1>
        <p className="text-sm text-muted-foreground">
          Revisa y autoriza solicitudes de fondos y rendiciones de gastos según tu nivel de firma.
        </p>
      </div>

      {/* Alertas */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>Acción procesada con éxito y registrada en el historial de auditoría.</span>
        </div>
      )}

      {/* Pestañas de la bandeja */}
      <nav className="flex gap-2 border-b border-border pb-px overflow-x-auto">
        <a
          href="/aprobaciones?tab=fondos"
          className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
            currentTab === "fondos"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Wallet size={16} />
          Solicitudes de Fondos ({pendingFunds?.length ?? 0})
        </a>

        <a
          href="/aprobaciones?tab=rendiciones"
          className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
            currentTab === "rendiciones"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Receipt size={16} />
          Rendiciones y Reembolsos ({totalRendicionesCount})
        </a>

        <a
          href="/aprobaciones?tab=historial"
          className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
            currentTab === "historial"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <History size={16} />
          Historial de Auditoría
        </a>
      </nav>

      {/* ===================================================================
          1. TAB: FONDOS POR APROBAR / DEPOSITAR
          =================================================================== */}
      {currentTab === "fondos" && (
        <div className="space-y-6">
          {/* A. Etapa 1: Aprobación Operaciones */}
          {isOperaciones && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white text-xs">
                    1
                  </span>
                  Por Aprobar por Gerencia de Operaciones ({fondosPorRevisarOperaciones.length})
                </h2>
                <span className="text-xs text-muted-foreground">Etapa Operaciones</span>
              </div>

              {fondosPorRevisarOperaciones.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No hay solicitudes pendientes de aprobación de Operaciones.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {fondosPorRevisarOperaciones.map((fund) => (
                    <div key={fund.id} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">
                            {fund.user_profile?.full_name || fund.user_profile?.email}
                          </span>
                          <span className="text-xs text-muted-foreground">({fund.user_profile?.email})</span>
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Pendiente Operaciones
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-primary">{fund.companies?.name}</p>
                        <p className="text-xs text-muted-foreground">Motivo: {fund.purpose}</p>
                        <p className="text-[11px] text-muted-foreground">Solicitado el {formatDate(fund.created_at)}</p>
                      </div>

                      <div className="flex flex-col sm:items-end gap-3">
                        <span className="text-lg font-bold">{formatClp(fund.requested_amount)}</span>
                        {fund.user_id === profile.id ? (
                          <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                            Tu solicitud (esperando otro aprobador)
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <RejectFundModal fundId={fund.id} purpose={fund.purpose} />
                            <ApproveFundModal
                              fundId={fund.id}
                              solicitante={fund.user_profile?.full_name || fund.user_profile?.email}
                              requestedAmount={fund.requested_amount}
                              purpose={fund.purpose}
                              companyName={fund.companies?.name || "Empresa"}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* B. Etapa 2: Depósito y Activación por Gerencia General */}
          {isGerenciaGeneral && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">
                    2
                  </span>
                  Por Depositar y Activar — Gerencia General ({fondosPorDepositarGM.length})
                </h2>
                <span className="text-xs text-muted-foreground">Requiere comprobante bancario</span>
              </div>

              {fondosPorDepositarGM.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No hay fondos esperando depósito de Gerencia General.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {fondosPorDepositarGM.map((fund) => {
                    const amountToTransfer = fund.approved_amount || fund.requested_amount;
                    return (
                      <div key={fund.id} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">
                              {fund.user_profile?.full_name || fund.user_profile?.email}
                            </span>
                            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                              Aprobado por Operaciones
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-primary">{fund.companies?.name}</p>
                          <p className="text-xs text-muted-foreground">Motivo: {fund.purpose}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Teléfono colaborador: {fund.user_profile?.phone || "No especificado"}
                          </p>
                        </div>

                        <div className="flex flex-col sm:items-end gap-3">
                          <div className="text-left sm:text-right">
                            <span className="block text-[11px] uppercase text-muted-foreground">Monto Aprobado</span>
                            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                              {formatClp(amountToTransfer)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <RejectFundModal fundId={fund.id} purpose={fund.purpose} />
                            <DepositFundModal
                              fundId={fund.id}
                              solicitante={fund.user_profile?.full_name || fund.user_profile?.email}
                              amount={amountToTransfer}
                              purpose={fund.purpose}
                              companyName={fund.companies?.name || "Empresa"}
                              appliedCredit={fund.applied_credit}
                              reimbursementsBonus={fund.reimbursements_bonus}
                              netDepositAmount={fund.net_deposit_amount}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
          2. TAB: RENDICIONES DE GASTOS Y REEMBOLSOS
          =================================================================== */}
      {currentTab === "rendiciones" && (
        <div className="space-y-6">
          {/* SECCIÓN A: Por Revisar y Aprobar (Operaciones) */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs">
                  1
                </span>
                Rendiciones y Reembolsos por Revisar ({rendicionesPorRevisar.length})
              </h2>
              <span className="text-xs text-muted-foreground">Revisión ítem por ítem</span>
            </div>

            {rendicionesPorRevisar.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No hay rendiciones pendientes de revisión en este momento.
              </p>
            ) : (
              <div className="space-y-6">
                {rendicionesPorRevisar.map((report) => {
                  const statusCfg = REPORT_STATUS_CONFIG[report.status] || { label: report.status, bg: "bg-gray-100", text: "text-gray-700" };
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const items = (report.expenses || []) as any[];

                  const pendingCount = items.filter((e) => e.status === "pending").length;
                  const approvedCount = items.filter((e) => e.status === "approved").length;
                  const rejectedCount = items.filter((e) => e.status === "rejected").length;

                  return (
                    <div key={report.id} className="rounded-2xl border border-border bg-background p-5 shadow-sm space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-foreground">{report.title}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                              {statusCfg.label}
                            </span>
                            {report.report_type === "reimbursement" ? (
                              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                💰 Reembolso a Favor del Colaborador
                              </span>
                            ) : (
                              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-primary dark:bg-brand-950 dark:text-primary">
                                📁 Fondo por Rendir
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Rendido por: <strong className="text-foreground">{report.user_profile?.full_name}</strong> ({report.user_profile?.email}) · Enviado el {formatDate(report.submitted_at)}
                          </p>
                          {report.report_type === "fund_rendition" ? (
                            <p className="text-xs text-primary font-medium mt-0.5">
                              Asociado a Fondo: {report.cash_advances?.purpose} (Saldo inicial: {formatClp(report.cash_advances?.initial_amount)})
                            </p>
                          ) : (
                            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mt-0.5">
                              ℹ️ Dinero personal del colaborador — Al aprobar, pasará a Gerencia General para realizar la transferencia.
                            </p>
                          )}
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="block text-xs uppercase text-muted-foreground">
                            {report.report_type === "reimbursement" ? "Monto a Devolver" : "Total Rendido"}
                          </span>
                          <span className={`text-xl font-bold ${report.report_type === "reimbursement" ? "text-blue-600 dark:text-blue-400" : "text-foreground"}`}>
                            {formatClp(report.total_amount)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {approvedCount} aprobados · {rejectedCount} observados · {pendingCount} pendientes
                          </span>
                        </div>
                      </div>

                      {/* Detalle ítem por ítem con botones de aprobación parcial */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Gastos Detallados ({items.length} ítems) — Revisa y aprueba individualmente:
                        </h4>
                        <div className="space-y-2">
                          {items.map((expense) => (
                            <ExpenseApprovalItem
                              key={expense.id}
                              expense={expense}
                              receiptUrl={receiptUrls[expense.id] || null}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Acciones de Cierre / Resolución del Informe */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                        <div className="text-xs text-muted-foreground">
                          {rejectedCount > 0 ? (
                            <span className="text-orange-600 font-semibold">
                              ⚠️ Hay {rejectedCount} ítem(s) observado(s). Al resolver, el informe quedará &quot;Con Observaciones&quot; para que el colaborador corrija solo esos ítems.
                            </span>
                          ) : (
                            <span>Todos los ítems están conformes.</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <form action={resolveReport}>
                            <input type="hidden" name="report_id" value={report.id} />
                            <input type="hidden" name="action" value="approve_all" />
                            <button
                              type="submit"
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-emerald-700 active:scale-95"
                            >
                              {report.report_type === "reimbursement" ? "Aprobar Reembolso" : "Aprobar Rendición"}
                            </button>
                          </form>

                          {isGerenciaGeneral && (
                            report.report_type === "reimbursement" ? (
                              <SettleReimbursementModal
                                reportId={report.id}
                                solicitante={report.user_profile?.full_name || report.user_profile?.email}
                                amount={report.total_amount}
                                title={report.title}
                              />
                            ) : (
                              <form action={resolveReport}>
                                <input type="hidden" name="report_id" value={report.id} />
                                <input type="hidden" name="action" value="settle" />
                                <button
                                  type="submit"
                                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 active:scale-95"
                                >
                                  Liquidar y Cerrar Fondo
                                </button>
                              </form>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECCIÓN B: Reembolsos Aprobados Listos para Pago (Gerencia General) */}
          {isGerenciaGeneral && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs">
                    2
                  </span>
                  Reembolsos Aprobados por Transferir / Pagar — Gerencia General ({reembolsosPorPagarGM.length})
                </h2>
                <span className="text-xs text-muted-foreground">Requiere comprobante de transferencia o efectivo</span>
              </div>

              {reembolsosPorPagarGM.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No hay reembolsos aprobados esperando pago en este momento.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {reembolsosPorPagarGM.map((rep) => {
                    const repAmount = Number(rep.total_amount) > 0 ? Number(rep.total_amount) : (rep.expenses || []).reduce((acc: number, exp: { total_amount?: number | null }) => acc + Number(exp.total_amount || 0), 0);
                    return (
                      <div key={rep.id} className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">
                              {rep.user_profile?.full_name || rep.user_profile?.email}
                            </span>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              ✓ Aprobado por Operaciones
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-foreground">{rep.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {rep.expenses?.length || 0} gastos incluidos · Proveedor: {rep.expenses?.[0]?.supplier_name || "Varios"}
                          </p>
                        </div>

                        <div className="flex flex-col sm:items-end gap-3">
                          <div className="text-left sm:text-right">
                            <span className="block text-[11px] uppercase text-muted-foreground">Monto a Devolver</span>
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                              {formatClp(repAmount)}
                            </span>
                          </div>

                          <SettleReimbursementModal
                            reportId={rep.id}
                            solicitante={rep.user_profile?.full_name || rep.user_profile?.email}
                            amount={repAmount}
                            title={rep.title}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
          3. TAB: HISTORIAL DE AUDITORÍA
          =================================================================== */}
      {currentTab === "historial" && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold">Registro de Auditoría de Aprobaciones</h2>
          <div className="divide-y divide-border">
            {historyLogs?.map((log) => (
              <div key={log.id} className="py-3 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-foreground">
                      {log.approver?.full_name || log.approver?.email || "Sistema"}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">
                      {log.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      sobre solicitud de {log.subject?.full_name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{log.comments}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatDate(log.created_at)}
                </span>
              </div>
            ))}
            {!historyLogs?.length && (
              <p className="py-6 text-center text-xs text-muted-foreground">No hay registros de auditoría aún.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
