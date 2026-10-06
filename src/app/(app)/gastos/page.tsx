import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatClp, formatDate, REPORT_STATUS_CONFIG } from "@/lib/format";
import { deleteExpense, submitReport } from "./actions";
import { Plus, Receipt, AlertCircle, CheckCircle2, FileText, Trash2, Send, Clock } from "lucide-react";
import Link from "next/link";
import { getSignedFileUrl } from "@/lib/supabase/storage";

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const profile = await requireRole("employee", "manager", "admin");
  const { error, success } = await searchParams;

  const sb = await createClient();

  // Obtener informes del usuario con sus gastos detallados
  const { data: reports } = await sb
    .from("expense_reports")
    .select(`
      *,
      cash_advances(purpose, initial_amount, current_balance),
      expenses(
        id, date, supplier_name, supplier_rut, invoice_number,
        total_amount, tax_amount, has_receipt, receipt_path, is_duplicate_flag,
        description, justification, status, rejection_reason,
        companies(name), departments(name, code), categories(name), receipt_types(name)
      )
    `)
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  // Obtener URLs firmadas de comprobantes
  const receiptUrls: Record<string, string | null> = {};
  if (reports) {
    const allExpenses = reports.flatMap((r) => r.expenses || []);
    await Promise.all(
      allExpenses
        .filter((e) => e.receipt_path)
        .map(async (e) => {
          receiptUrls[e.id] = await getSignedFileUrl("receipts", e.receipt_path);
        })
    );
  }

  const drafts = reports?.filter((r) => r.status === "draft" || r.status === "partially_approved") ?? [];
  const inReview = reports?.filter((r) => r.status === "submitted") ?? [];
  const history = reports?.filter((r) => r.status === "approved" || r.status === "settled" || r.status === "rejected") ?? [];

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado y botón */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis Rendiciones y Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Registra tus gastos con boletas/facturas y envíalos a revisión para su aprobación.
          </p>
        </div>
        <Link
          href="/gastos/nuevo"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600 active:scale-95"
        >
          <Plus size={18} strokeWidth={2.5} />
          Registrar Gasto
        </Link>
      </div>

      {/* Alertas */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={20} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success === "gasto_agregado" && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>Gasto guardado en tu informe borrador. Puedes agregar más gastos o pulsar &quot;Enviar a Revisión&quot;.</span>
        </div>
      )}
      {success === "informe_enviado" && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>Informe enviado a revisión por Gerencia de Operaciones.</span>
        </div>
      )}
      {success === "gasto_eliminado" && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
          <CheckCircle2 size={20} className="shrink-0" />
          <span>Gasto eliminado.</span>
        </div>
      )}

      {/* 1. SECCIÓN: INFORMES EN BORRADOR / PENDIENTES DE ENVÍO */}
      <div className="space-y-4">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Clock size={18} className="text-primary" />
          Informes en Borrador (Pendientes de Envío)
        </h2>

        {drafts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
            No tienes informes pendientes de envío. Pulsa &quot;Registrar Gasto&quot; para crear uno nuevo.
          </div>
        ) : (
          drafts.map((report) => {
            const statusCfg = REPORT_STATUS_CONFIG[report.status] || { label: report.status, bg: "bg-gray-100", text: "text-gray-700" };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const items = (report.expenses || []) as any[];

            return (
              <div key={report.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">{report.title}</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Modalidad: {report.report_type === "fund_rendition" ? `Fondo por Rendir (${report.cash_advances?.purpose})` : "Reembolso Directo"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-right">
                      <span className="block text-xs uppercase text-muted-foreground">Total Informe</span>
                      <span className="text-lg font-bold text-primary">{formatClp(report.total_amount)}</span>
                    </span>

                    {items.length > 0 && (
                      <form action={submitReport}>
                        <input type="hidden" name="report_id" value={report.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 active:scale-95"
                        >
                          <Send size={16} />
                          Enviar a Revisión
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Lista de gastos del informe */}
                <div className="divide-y divide-border">
                  {items.map((exp) => (
                    <div key={exp.id} className="py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{exp.categories?.name || "Sin categoría"}</span>
                          <span className="text-xs text-muted-foreground">· {exp.companies?.name}</span>
                          <span className="text-xs text-muted-foreground">· {exp.departments?.name}</span>
                          {exp.is_duplicate_flag && (
                            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Posible Duplicado
                            </span>
                          )}
                          {!exp.has_receipt && (
                            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                              Sin Comprobante
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {formatDate(exp.date)} {exp.supplier_name ? `· ${exp.supplier_name}` : ""} {exp.invoice_number ? `· Folio: ${exp.invoice_number}` : ""}
                        </p>

                        {exp.justification && (
                          <p className="text-xs italic text-amber-800 dark:text-amber-300">
                            Justificación: {exp.justification}
                          </p>
                        )}
                        {exp.description && (
                          <p className="text-xs text-muted-foreground">
                            Glosa: {exp.description}
                          </p>
                        )}
                        {exp.rejection_reason && (
                          <p className="rounded-md bg-rose-50 p-1.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                            <strong>Observación:</strong> {exp.rejection_reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <span className="text-sm font-bold">{formatClp(exp.total_amount)}</span>

                        {receiptUrls[exp.id] && (
                          <a
                            href={receiptUrls[exp.id]!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary"
                            title="Ver Comprobante"
                          >
                            <FileText size={16} />
                          </a>
                        )}

                        <form action={deleteExpense}>
                          <input type="hidden" name="expense_id" value={exp.id} />
                          <button
                            type="submit"
                            title="Eliminar gasto"
                            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 size={16} />
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <Link
                    href={`/gastos/nuevo?report_id=${report.id}${report.fund_id ? `&fund_id=${report.fund_id}` : ""}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Plus size={14} /> Agregar otro gasto a este informe
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 2. SECCIÓN: INFORMES EN REVISIÓN */}
      {inReview.length > 0 && (
        <div className="space-y-4 pt-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Receipt size={18} className="text-amber-500" />
            Informes Enviados en Revisión ({inReview.length})
          </h2>

          {inReview.map((report) => (
            <div key={report.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-3 opacity-95">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold">{report.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Enviado el {formatDate(report.submitted_at)} · {report.expenses?.length || 0} ítems
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                    En Revisión de Operaciones
                  </span>
                  <span className="block mt-1 text-base font-bold">{formatClp(report.total_amount)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. SECCIÓN: HISTORIAL DE INFORMES APROBADOS / LIQUIDADOS */}
      {history.length > 0 && (
        <div className="space-y-4 pt-4">
          <h2 className="text-base font-bold">Historial de Rendiciones Pasadas</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface p-5 shadow-sm">
            {history.map((report) => {
              const statusCfg = REPORT_STATUS_CONFIG[report.status] || { label: report.status, bg: "bg-gray-100", text: "text-gray-700" };
              return (
                <div key={report.id} className="py-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">{report.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Fecha: {formatDate(report.created_at)} · {report.expenses?.length || 0} ítems
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                      {statusCfg.label}
                    </span>
                    <span className="block mt-0.5 text-sm font-bold">{formatClp(report.approved_amount || report.total_amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
