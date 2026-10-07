"use client";

import { useState, useRef } from "react";
import { Check, X, Upload, FileText, CheckCircle2, Ban, Loader2 } from "lucide-react";
import { approveFundByAdmin, depositFundByGM, rejectFund, approveExpenseItem, rejectExpenseItem, settleReimbursementWithProof } from "./actions";
import { formatClp, formatRut, formatDate } from "@/lib/format";
import { compressImage } from "@/lib/image-compression";

/* -------------------------------------------------------------------------
   1. Modal de Aprobación de Fondos por Gerencia de Operaciones
   ------------------------------------------------------------------------- */
export function ApproveFundModal({
  fundId,
  solicitante,
  requestedAmount,
  purpose,
  companyName,
}: {
  fundId: string;
  solicitante: string;
  requestedAmount: number;
  purpose: string;
  companyName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState(new Intl.NumberFormat("es-CL").format(requestedAmount));
  const [comments, setComments] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsPending(true);

    try {
      const fd = new FormData();
      fd.set("fund_id", fundId);
      fd.set("approved_amount", amountStr);
      fd.set("comments", comments);

      await approveFundByAdmin(fd);
      setOpen(false);
    } catch (err: any) {
      if (err?.message?.includes("NEXT_REDIRECT")) {
        return;
      }
      setErrorMessage(err?.message || "Error al aprobar la solicitud.");
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setErrorMessage(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
      >
        <Check size={16} strokeWidth={2.5} />
        Aprobar Solicitud
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold">Aprobar Solicitud de Fondo</h2>
              <button
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-border bg-background p-3.5 space-y-1.5 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Solicitante:</strong> {solicitante}</p>
              {companyName && <p><strong className="text-foreground">Empresa:</strong> {companyName}</p>}
              <p><strong className="text-foreground">Motivo:</strong> {purpose}</p>
              <p><strong className="text-foreground">Monto solicitado:</strong> {formatClp(requestedAmount)}</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <input type="hidden" name="fund_id" value={fundId} />

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Monto a Aprobar (CLP)
                </span>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-bold text-muted-foreground">
                    $
                  </span>
                  <input
                    name="approved_amount"
                    type="text"
                    inputMode="numeric"
                    required
                    disabled={isPending}
                    value={amountStr}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setAmountStr(raw ? new Intl.NumberFormat("es-CL").format(Number(raw)) : "");
                    }}
                    className="w-full rounded-xl border border-border bg-background py-2 pl-7 pr-3 text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Comentario u Observación (Opcional)
                </span>
                <textarea
                  name="comments"
                  rows={2}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  disabled={isPending}
                  placeholder="Ej: Aprobado para compras de terreno semana 1..."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
                />
              </label>

              <p className="text-[11px] text-muted-foreground">
                ℹ️ Al aprobar, la solicitud pasará a <strong>Gerencia General</strong> para la realización y comprobante del depósito.
              </p>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Aprobando...
                    </>
                  ) : (
                    "Confirmar Aprobación"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------
   2. Modal de Depósito / Activación de Fondos (Gerencia General / Admin)
   ------------------------------------------------------------------------- */
export function DepositFundModal({
  fundId,
  solicitante,
  amount,
  purpose,
  companyName,
}: {
  fundId: string;
  solicitante: string;
  amount: number;
  purpose: string;
  companyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [depositNote, setDepositNote] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSetFile = async (file: File) => {
    let target = file;
    if (file.type.startsWith("image/")) {
      try {
        target = await compressImage(file, { maxWidth: 1920, maxHeight: 1920, quality: 0.82 });
      } catch (err) {
        console.warn("Error comprimiendo comprobante de depósito:", err);
      }
    }
    setSelectedFile(target);
    setFileName(target.name || "comprobante_deposito.png");
    setErrorMessage(null);
    if (target.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(target));
    } else {
      setPreviewUrl(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          handleSetFile(file);
          break;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSetFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === "transfer" && !selectedFile) {
      setErrorMessage("Debes adjuntar o pegar el comprobante de la transferencia bancaria.");
      return;
    }

    setErrorMessage(null);
    startTransition(true);

    try {
      const fd = new FormData();
      fd.set("fund_id", fundId);
      fd.set("payment_method", paymentMethod);
      fd.set("deposit_note", depositNote);
      if (selectedFile) {
        fd.set("deposit_file", selectedFile);
      }

      await depositFundByGM(fd);
      setOpen(false);
    } catch (err: any) {
      if (err?.message?.includes("NEXT_REDIRECT")) {
        // Redirección exitosa de Next.js
        return;
      }
      setErrorMessage(err?.message || "Ocurrió un error al activar el fondo. Intenta nuevamente.");
      startTransition(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setErrorMessage(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-600 active:scale-95"
      >
        <Upload size={16} strokeWidth={2.5} />
        Registrar Depósito / Entrega
      </button>

      {open && (
        <div
          onPaste={handlePaste}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-base font-bold">Entrega / Depósito de Fondo</h2>
                <p className="text-xs text-muted-foreground">Gerencia General / Operaciones</p>
              </div>
              <button
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-border bg-background p-3.5 space-y-1 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Destinatario:</strong> {solicitante}</p>
              <p><strong className="text-foreground">Empresa:</strong> {companyName}</p>
              <p><strong className="text-foreground">Monto a Entregar:</strong> <span className="text-primary font-bold text-sm">{formatClp(amount)}</span></p>
              <p><strong className="text-foreground">Motivo:</strong> {purpose}</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <input type="hidden" name="fund_id" value={fundId} />

              {/* Selector de Modalidad de Entrega */}
              <div>
                <label className="block mb-1.5 text-xs font-semibold text-muted-foreground">
                  Modalidad de Entrega del Dinero *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("transfer");
                      setErrorMessage(null);
                    }}
                    className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                      paymentMethod === "transfer"
                        ? "border-primary bg-brand-50/50 text-primary ring-2 ring-primary/20 dark:bg-brand-950/30"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    🏦 Transferencia Bancaria
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("cash");
                      setErrorMessage(null);
                    }}
                    className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                      paymentMethod === "cash"
                        ? "border-primary bg-brand-50/50 text-primary ring-2 ring-primary/20 dark:bg-brand-950/30"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    💵 Entrega en Efectivo
                  </button>
                </div>
              </div>

              {/* Subida / Pegado de comprobante */}
              <div>
                <label className="block mb-1.5 text-xs font-semibold text-muted-foreground">
                  {paymentMethod === "transfer"
                    ? "Comprobante de Transferencia / Depósito (Obligatorio) *"
                    : "Recibo o Firma de Entrega en Efectivo (Opcional)"}
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSetFile(f);
                  }}
                  className="hidden"
                />

                {!fileName ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`cursor-pointer w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition ${
                      isDragging
                        ? "border-primary bg-brand-50 dark:bg-brand-950/40"
                        : "border-primary/50 bg-brand-50/20 hover:bg-brand-50/50 dark:bg-brand-950/20"
                    }`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm">
                      <Upload size={16} />
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {paymentMethod === "transfer"
                        ? "Haz clic para adjuntar comprobante o arrastra aquí"
                        : "Haz clic para adjuntar recibo/comprobante (opcional)"}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-primary">
                      💡 Tip: Puedes presionar Ctrl + V para pegar una captura de pantalla
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-xs">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="Comprobante" className="h-12 w-12 rounded-lg object-cover border border-border shrink-0" />
                    ) : (
                      <FileText size={24} className="text-primary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Comprobante cargado</p>
                      <p className="truncate text-muted-foreground">{fileName}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setSelectedFile(null);
                        setFileName(null);
                        setPreviewUrl(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                      className="text-rose-600 font-semibold hover:underline shrink-0 disabled:opacity-50"
                    >
                      Cambiar
                    </button>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  {paymentMethod === "transfer"
                    ? "N° de Operación o Nota Bancaria (Opcional)"
                    : "Detalle o Nota de Entrega en Efectivo (Opcional)"}
                </span>
                <input
                  name="deposit_note"
                  type="text"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  disabled={isPending}
                  placeholder={
                    paymentMethod === "transfer"
                      ? "Ej: Transf. Banco Santander N° 98402931"
                      : "Ej: Dinero entregado en sobre en oficina a Juan Pablo"
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={(paymentMethod === "transfer" && !selectedFile) || isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Activando Fondo...
                    </>
                  ) : paymentMethod === "cash" ? (
                    "Confirmar Entrega en Efectivo y Activar"
                  ) : (
                    "Registrar Transferencia y Activar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------
   3. Modal de Rechazo con Motivo Obligatorio
   ------------------------------------------------------------------------- */
export function RejectFundModal({ fundId, purpose }: { fundId: string; purpose: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30"
      >
        <Ban size={15} />
        Rechazar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-rose-600">Rechazar Solicitud de Fondo</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Fondo: <strong>{purpose}</strong>
            </p>

            <form action={rejectFund} className="mt-4 space-y-4">
              <input type="hidden" name="fund_id" value={fundId} />

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-rose-700 dark:text-rose-300">
                  Motivo de Rechazo (Obligatorio) *
                </span>
                <textarea
                  name="rejection_reason"
                  required
                  rows={3}
                  placeholder="Indica el motivo por el cual no se aprueba esta solicitud..."
                  className="w-full rounded-xl border border-rose-300 bg-background p-3 text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 dark:border-rose-800"
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-rose-700"
                >
                  Confirmar Rechazo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------
   4. Componente de Aprobación Parcial Ítem por Ítem de Gastos
   ------------------------------------------------------------------------- */
export function ExpenseApprovalItem({
  expense,
  receiptUrl,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expense: any;
  receiptUrl: string | null;
}) {
  const [rejecting, setRejecting] = useState(false);

  const isApproved = expense.status === "approved";
  const isRejected = expense.status === "rejected";

  return (
    <div className={`p-4 rounded-xl border transition ${
      isApproved
        ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-950 dark:bg-emerald-950/20"
        : isRejected
        ? "border-rose-200 bg-rose-50/30 dark:border-rose-950 dark:bg-rose-950/20"
        : "border-border bg-background"
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-sm text-foreground">{expense.categories?.name}</span>
            <span className="text-xs text-muted-foreground">· {expense.companies?.name}</span>
            <span className="text-xs text-muted-foreground">· {expense.departments?.name}</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">
              {expense.receipt_types?.name}
            </span>
            {isApproved && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                <CheckCircle2 size={12} /> Aprobado
              </span>
            )}
            {isRejected && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                Observado / Rechazado
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Fecha: {formatDate(expense.date)}
            {expense.supplier_name && ` · ${expense.supplier_name}`}
            {expense.supplier_rut && ` · RUT: ${formatRut(expense.supplier_rut)}`}
            {expense.invoice_number && ` · Folio: ${expense.invoice_number}`}
          </p>

          {expense.description && (
            <p className="text-xs text-muted-foreground">Glosa: {expense.description}</p>
          )}
          {expense.justification && (
            <p className="text-xs italic text-amber-800 dark:text-amber-300">
              Justificación sin comprobante: {expense.justification}
            </p>
          )}
          {expense.rejection_reason && (
            <p className="rounded-lg bg-rose-100 p-2 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              Observación de rechazo: {expense.rejection_reason}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          <div className="text-left sm:text-right">
            <span className="block text-base font-bold text-foreground">{formatClp(expense.total_amount)}</span>
            {expense.tax_amount > 0 && (
              <span className="text-[11px] text-muted-foreground">IVA: {formatClp(expense.tax_amount)}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {receiptUrl && (
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-primary hover:text-primary"
              >
                <FileText size={14} /> Ver Comprobante
              </a>
            )}

            {!isApproved && (
              <form action={approveExpenseItem}>
                <input type="hidden" name="expense_id" value={expense.id} />
                <button
                  type="submit"
                  title="Aprobar ítem"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                >
                  <Check size={14} /> Aprobar
                </button>
              </form>
            )}

            {!isRejected && !rejecting && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                title="Observar o rechazar ítem"
                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/30"
              >
                <X size={14} /> Observar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Formulario desplegable para motivo de rechazo individual */}
      {rejecting && (
        <form action={rejectExpenseItem} className="mt-3 border-t border-border pt-3 space-y-2">
          <input type="hidden" name="expense_id" value={expense.id} />
          <label className="block text-xs font-semibold text-rose-700 dark:text-rose-300">
            Observación / Motivo para rechazar este ítem:
          </label>
          <input
            name="rejection_reason"
            required
            placeholder="Ej: Factura no corresponde al RUT de la empresa seleccionada..."
            className="w-full rounded-xl border border-rose-300 bg-background px-3 py-1.5 text-xs outline-none focus:border-rose-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="px-2.5 py-1 text-xs rounded-lg border border-border"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs rounded-lg bg-rose-600 text-white font-bold"
            >
              Confirmar Observación
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
   5. Modal de Pago / Liquidación de Reembolso al Trabajador
   ------------------------------------------------------------------------- */
export function SettleReimbursementModal({
  reportId,
  solicitante,
  amount,
  title,
}: {
  reportId: string;
  solicitante: string;
  amount: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSetFile = async (file: File) => {
    let target = file;
    if (file.type.startsWith("image/")) {
      try {
        target = await compressImage(file, { maxWidth: 1920, maxHeight: 1920, quality: 0.82 });
      } catch (err) {
        console.warn("Error comprimiendo comprobante de liquidación:", err);
      }
    }
    setSelectedFile(target);
    setFileName(target.name || "comprobante_transferencia.png");
    setErrorMessage(null);
    if (target.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(target));
    } else {
      setPreviewUrl(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (paymentMethod !== "transfer") return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          handleSetFile(file);
          break;
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSetFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === "transfer" && !selectedFile) {
      setErrorMessage("Debes adjuntar o pegar el comprobante de la transferencia bancaria.");
      return;
    }

    setErrorMessage(null);
    setIsPending(true);

    try {
      const fd = new FormData();
      fd.set("report_id", reportId);
      fd.set("payment_method", paymentMethod);
      fd.set("payment_note", paymentNote);
      if (selectedFile) fd.set("proof_file", selectedFile);

      await settleReimbursementWithProof(fd);
      setOpen(false);
    } catch (err: any) {
      if (err?.message?.includes("NEXT_REDIRECT")) {
        return;
      }
      setErrorMessage(err?.message || "Error al liquidar el reembolso.");
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setErrorMessage(null);
        }}
        className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 active:scale-95"
      >
        Pagar y Liquidar Reembolso
      </button>

      {open && (
        <div
          onPaste={handlePaste}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-base font-bold">Registrar Pago de Reembolso</h2>
                <p className="text-xs text-muted-foreground">Devolución de dinero al trabajador</p>
              </div>
              <button
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-border bg-background p-3.5 space-y-1 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Colaborador:</strong> {solicitante}</p>
              <p><strong className="text-foreground">Monto a Devolver:</strong> <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{formatClp(amount)}</span></p>
              <p><strong className="text-foreground">Informe:</strong> {title}</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Selector de Método de Pago */}
              <div>
                <label className="block mb-1.5 text-xs font-semibold text-muted-foreground">
                  Método de Pago
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("transfer")}
                    className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                      paymentMethod === "transfer"
                        ? "border-primary bg-brand-50/50 text-primary ring-2 ring-primary/20 dark:bg-brand-950/30"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    Transferencia Bancaria
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                      paymentMethod === "cash"
                        ? "border-primary bg-brand-50/50 text-primary ring-2 ring-primary/20 dark:bg-brand-950/30"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    Pago en Efectivo
                  </button>
                </div>
              </div>

              {/* Subida de comprobante solo si es transferencia */}
              {paymentMethod === "transfer" ? (
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-muted-foreground">
                    Comprobante de Transferencia Bancaria (Obligatorio) *
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSetFile(f);
                    }}
                    className="hidden"
                  />

                  {!fileName ? (
                    <div
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      className={`cursor-pointer w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition ${
                        isDragging
                          ? "border-primary bg-brand-50 dark:bg-brand-950/40"
                          : "border-primary/50 bg-brand-50/20 hover:bg-brand-50/50 dark:bg-brand-950/20"
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm">
                        <Upload size={16} />
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        Haz clic para adjuntar comprobante o arrastra aquí
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-primary">
                        💡 Tip: Puedes presionar Ctrl + V para pegar la captura
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 text-xs">
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="Comprobante" className="h-12 w-12 rounded-lg object-cover border border-border shrink-0" />
                      ) : (
                        <FileText size={24} className="text-primary shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">✓ Comprobante listo</p>
                        <p className="truncate text-muted-foreground">{fileName}</p>
                      </div>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setSelectedFile(null);
                          setFileName(null);
                          setPreviewUrl(null);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                        className="text-rose-600 font-semibold hover:underline shrink-0 disabled:opacity-50"
                      >
                        Cambiar
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
                  ℹ️ Pago en Efectivo: No es obligatorio adjuntar comprobante bancario.
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Nota / N° Operación (Opcional)
                </span>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  disabled={isPending}
                  placeholder={paymentMethod === "cash" ? "Ej: Entregado en efectivo en oficina central" : "Ej: Transf. Santander N° 9812401"}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending || (paymentMethod === "transfer" && !selectedFile)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Registrando Pago...
                    </>
                  ) : (
                    "Confirmar Pago y Liquidar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
