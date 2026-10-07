"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Upload, FileText, CheckCircle2, Ban, Loader2, CheckSquare, Square, Receipt } from "lucide-react";
import {
  approveFundByAdmin,
  depositFundByGM,
  rejectFund,
  approveExpenseItem,
  rejectExpenseItem,
  settleReimbursementWithProof,
  settleMultipleReimbursementsWithProof,
} from "./actions";
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
  const router = useRouter();
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

      const res = await approveFundByAdmin(fd);
      if (res.success) {
        setOpen(false);
        router.push("/aprobaciones?success=fondo_aprobado_operaciones");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Error al aprobar la solicitud.");
        setIsPending(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Error inesperado al procesar la aprobación.");
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
  appliedCredit = 0,
  reimbursementsBonus = 0,
  netDepositAmount,
}: {
  fundId: string;
  solicitante: string;
  amount: number;
  purpose: string;
  companyName: string;
  appliedCredit?: number;
  reimbursementsBonus?: number;
  netDepositAmount?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [depositNote, setDepositNote] = useState("");
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
    setIsPending(true);

    try {
      const fd = new FormData();
      fd.set("fund_id", fundId);
      fd.set("payment_method", paymentMethod);
      fd.set("deposit_note", depositNote);
      if (selectedFile) {
        fd.set("deposit_file", selectedFile);
      }

      const res = await depositFundByGM(fd);
      if (res.success) {
        setOpen(false);
        router.push("/aprobaciones?success=fondo_depositado_activado");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Ocurrió un error al activar el fondo. Intenta nuevamente.");
        setIsPending(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Ocurrió un error inesperado al activar el fondo.");
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

            <div className="mt-4 rounded-xl border border-border bg-background p-3.5 space-y-1.5 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Destinatario:</strong> {solicitante}</p>
              <p><strong className="text-foreground">Empresa:</strong> {companyName}</p>
              <p><strong className="text-foreground">Motivo:</strong> {purpose}</p>

              <div className="rounded-xl border border-border bg-surface p-3 space-y-1.5 mt-2">
                <div className="flex justify-between items-center text-xs">
                  <span>Monto del Nuevo Fondo:</span>
                  <span className="font-bold text-foreground">{formatClp(amount)}</span>
                </div>

                {reimbursementsBonus > 0 && (
                  <div className="flex justify-between items-center text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <span>+ Reembolso(s) Aprobado(s) por pagar al empleado:</span>
                    <span className="font-bold">+{formatClp(reimbursementsBonus)}</span>
                  </div>
                )}

                {appliedCredit > 0 && (
                  <div className="flex justify-between items-center text-xs text-amber-700 dark:text-amber-400 font-medium">
                    <span>- Abono saldo a favor empresa (fondo anterior):</span>
                    <span className="font-bold">-{formatClp(appliedCredit)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center border-t border-border pt-2 text-sm font-extrabold text-foreground">
                  <span>Monto Total a Transferir Hoy:</span>
                  <span className="text-primary text-base">
                    {formatClp(netDepositAmount != null ? netDepositAmount : amount - appliedCredit + reimbursementsBonus)}
                  </span>
                </div>

                {reimbursementsBonus > 0 && (
                  <p className="text-[10px] text-muted-foreground italic pt-1">
                    * Al activar este fondo, el/los reembolsos pendientes del colaborador quedarán automáticamente marcados como pagados y saldados.
                  </p>
                )}
              </div>
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsPending(true);

    try {
      const fd = new FormData();
      fd.set("fund_id", fundId);
      fd.set("rejection_reason", rejectionReason);

      const res = await rejectFund(fd);
      if (res.success) {
        setOpen(false);
        router.push("/aprobaciones?success=fondo_rechazado");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Error al rechazar el fondo.");
        setIsPending(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al rechazar el fondo.");
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

            <p className="mt-3 text-xs text-muted-foreground">
              Fondo: <strong>{purpose}</strong>
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <input type="hidden" name="fund_id" value={fundId} />

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-rose-700 dark:text-rose-300">
                  Motivo de Rechazo (Obligatorio) *
                </span>
                <textarea
                  name="rejection_reason"
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  disabled={isPending}
                  placeholder="Indica el motivo por el cual no se aprueba esta solicitud..."
                  className="w-full rounded-xl border border-rose-300 bg-background p-3 text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 dark:border-rose-800 disabled:opacity-50"
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
                  disabled={isPending}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-rose-700 disabled:opacity-50"
                >
                  {isPending ? "Rechazando..." : "Confirmar Rechazo"}
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
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const isApproved = expense.status === "approved";
  const isRejected = expense.status === "rejected";

  const handleApprove = async () => {
    setIsProcessing(true);
    const fd = new FormData();
    fd.set("expense_id", expense.id);
    const res = await approveExpenseItem(fd);
    if (res.success) {
      router.refresh();
    } else {
      alert(res.error || "Error al aprobar ítem.");
    }
    setIsProcessing(false);
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason || rejectionReason.length < 5) {
      alert("Ingresa una observación detallada (mínimo 5 caracteres).");
      return;
    }
    setIsProcessing(true);
    const fd = new FormData();
    fd.set("expense_id", expense.id);
    fd.set("rejection_reason", rejectionReason);
    const res = await rejectExpenseItem(fd);
    if (res.success) {
      setRejecting(false);
      router.refresh();
    } else {
      alert(res.error || "Error al rechazar ítem.");
    }
    setIsProcessing(false);
  };

  return (
    <div
      className={`p-4 rounded-xl border transition ${
        isApproved
          ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-950 dark:bg-emerald-950/20"
          : isRejected
          ? "border-rose-200 bg-rose-50/30 dark:border-rose-950 dark:bg-rose-950/20"
          : "border-border bg-background"
      }`}
    >
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
              <button
                type="button"
                onClick={handleApprove}
                disabled={isProcessing}
                title="Aprobar ítem"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check size={14} /> Aprobar
              </button>
            )}

            {!isRejected && !rejecting && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={isProcessing}
                title="Observar o rechazar ítem"
                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/30 disabled:opacity-50"
              >
                <X size={14} /> Observar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Formulario desplegable para justificar observación */}
      {rejecting && (
        <form onSubmit={handleReject} className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
          <textarea
            required
            rows={2}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            disabled={isProcessing}
            placeholder="Escribe el motivo del rechazo u observación para el colaborador..."
            className="w-full rounded-lg border border-rose-300 bg-background p-2 text-xs outline-none focus:border-rose-500 dark:border-rose-800 disabled:opacity-50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setRejecting(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
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
   5. Modal de Liquidación / Pago de Reembolso
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
  const router = useRouter();
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

      const res = await settleReimbursementWithProof(fd);
      if (res.success) {
        setOpen(false);
        router.push("/aprobaciones?success=reembolso_pagado_liquidado");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Error al liquidar el reembolso.");
        setIsPending(false);
      }
    } catch (err: any) {
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
                    Transferencia Bancaria
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

/* -------------------------------------------------------------------------
   6. Tarjeta de Colaborador con Selector Interactivo y Liquidación en Lote
   ------------------------------------------------------------------------- */
export type CollaboratorReimbursementItem = {
  id: string;
  title: string;
  created_at: string;
  total_amount: number;
  expenses_count: number;
  supplier_name?: string | null;
};

export function CollaboratorReimbursementCard({
  solicitante,
  collaboratorEmail,
  reports,
}: {
  solicitante: string;
  collaboratorEmail?: string | null;
  reports: CollaboratorReimbursementItem[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(() => reports.map((r) => r.id));
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = (solicitante || "U").charAt(0).toUpperCase();

  const toggleSelectAll = () => {
    if (selectedIds.length === reports.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(reports.map((r) => r.id));
    }
  };

  const toggleItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Calcular suma dinámica según los seleccionados
  const selectedReports = reports.filter((r) => selectedIds.includes(r.id));
  const selectedTotal = selectedReports.reduce((sum, r) => sum + r.total_amount, 0);

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
    if (selectedIds.length === 0) {
      setErrorMessage("Debes seleccionar al menos un reembolso para realizar la liquidación.");
      return;
    }

    if (paymentMethod === "transfer" && !selectedFile) {
      setErrorMessage("Debes adjuntar o pegar el comprobante de la transferencia bancaria.");
      return;
    }

    setErrorMessage(null);
    setIsPending(true);

    try {
      const fd = new FormData();
      fd.set("report_ids", JSON.stringify(selectedIds));
      fd.set("payment_method", paymentMethod);
      fd.set("payment_note", paymentNote);
      if (selectedFile) fd.set("proof_file", selectedFile);

      const res = await settleMultipleReimbursementsWithProof(fd);
      if (res.success) {
        setModalOpen(false);
        router.push("/aprobaciones?success=reembolsos_agrupados_pagados");
        router.refresh();
      } else {
        setErrorMessage(res.error || "Error al liquidar los reembolsos.");
        setIsPending(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al liquidar los reembolsos.");
      setIsPending(false);
    }
  };

  return (
    <div className="py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Columna Izquierda: Información del colaborador y selector de reembolsos */}
      <div className="space-y-3 max-w-xl flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs dark:bg-blue-950 dark:text-blue-300">
            {initial}
          </span>
          <span className="font-bold text-sm text-foreground">
            {solicitante}
          </span>
          {collaboratorEmail && (
            <span className="text-xs text-muted-foreground">
              · {collaboratorEmail}
            </span>
          )}
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            ✓ {reports.length} {reports.length === 1 ? "reembolso aprobado" : "reembolsos aprobados"}
          </span>
          {reports.length > 1 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-primary hover:underline ml-1 cursor-pointer"
            >
              {selectedIds.length === reports.length ? "Desmarcar todos" : "Seleccionar todos"}
            </button>
          )}
        </div>

        {/* Listado con selector interactivo DIRECTO en la tarjeta */}
        <div className="pl-1 sm:pl-9 space-y-1.5">
          {reports.map((r) => {
            const isChecked = selectedIds.includes(r.id);
            return (
              <div
                key={r.id}
                onClick={() => toggleItem(r.id)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 text-xs transition cursor-pointer select-none ${
                  isChecked
                    ? "border-primary/50 bg-blue-50/70 dark:border-primary/60 dark:bg-blue-950/40 text-foreground shadow-xs"
                    : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 opacity-70"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`shrink-0 ${isChecked ? "text-primary" : "text-muted-foreground"}`}>
                    {isChecked ? (
                      <CheckSquare size={17} className="text-primary" />
                    ) : (
                      <Square size={17} className="text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold truncate block text-foreground">
                      {r.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate block">
                      {formatDate(r.created_at)} · {r.expenses_count} {r.expenses_count === 1 ? "gasto" : "gastos"} · Prov: {r.supplier_name || "Varios"}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`font-bold text-sm ${isChecked ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                    {formatClp(r.total_amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Columna Derecha: Monto calculado dinámicamente y botón de acción */}
      <div className="flex flex-col sm:items-end gap-3 shrink-0">
        <div className="text-left sm:text-right">
          <span className="block text-[11px] uppercase text-muted-foreground font-semibold">
            {selectedIds.length === reports.length
              ? "Monto Total Acumulado"
              : `Total Seleccionado (${selectedIds.length}/${reports.length})`}
          </span>
          <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
            {formatClp(selectedTotal)}
          </span>
        </div>

        <button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={() => {
            setErrorMessage(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Receipt size={15} />
          {selectedIds.length === 0
            ? "Selecciona reembolsos"
            : `Pagar y Liquidar (${selectedIds.length}) · ${formatClp(selectedTotal)}`}
        </button>
      </div>

      {/* Modal de Pago y Subida de Comprobante para los reembolsos seleccionados */}
      {modalOpen && (
        <div
          onPaste={handlePaste}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl animate-in zoom-in-95">
            {/* Cabecera modal */}
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold">Liquidar Reembolsos de {solicitante}</h2>
                <p className="text-xs text-muted-foreground">
                  Se liquidarán <strong>{selectedIds.length}</strong> de <strong>{reports.length}</strong> reembolsos por un total de <strong>{formatClp(selectedTotal)}</strong>.
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Cuerpo con scroll */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {errorMessage && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                  {errorMessage}
                </div>
              )}

              {/* Resumen de los seleccionados */}
              <div className="rounded-xl border border-border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>Reembolsos a Liquidar:</span>
                  <span className="text-primary font-bold">{selectedIds.length} seleccionados</span>
                </div>
                <div className="space-y-1">
                  {selectedReports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-medium">• {r.title}</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{formatClp(r.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tarjeta de Total a Transferir */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900/50 dark:bg-blue-950/30 flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-blue-900 dark:text-blue-300">
                    Total Consolidado a Transferir
                  </span>
                  <span className="text-[11px] text-blue-700/90 dark:text-blue-400">
                    {selectedIds.length} informe(s) a saldar
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-blue-700 dark:text-blue-300">
                    {formatClp(selectedTotal)}
                  </span>
                </div>
              </div>

              {/* Formulario de Pago */}
              <form id="grouped-settle-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Selector de Método de Pago */}
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-muted-foreground">
                    Método de Entrega / Pago
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
                      💵 Pago en Efectivo
                    </button>
                  </div>
                </div>

                {/* Subida de comprobante solo si es transferencia */}
                {paymentMethod === "transfer" ? (
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-muted-foreground">
                      Comprobante de Transferencia Consolidada (Obligatorio) *
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
                        className={`cursor-pointer w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition ${
                          isDragging
                            ? "border-primary bg-brand-50 dark:bg-brand-950/40"
                            : "border-primary/50 bg-brand-50/20 hover:bg-brand-50/50 dark:bg-brand-950/20"
                        }`}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm">
                          <Upload size={15} />
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          Haz clic para adjuntar comprobante o arrastra aquí
                        </span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-primary">
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
                          }}
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    ℹ️ Se registrará la entrega en efectivo por <strong>{formatClp(selectedTotal)}</strong>. Se notificará directamente a {solicitante} para su confirmación.
                  </div>
                )}

                {/* Nota u Observación */}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Nota / N° Operación (Opcional)
                  </span>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    disabled={isPending}
                    placeholder={paymentMethod === "cash" ? "Ej: Entregado en efectivo en oficina central" : "Ej: Transf. Banco Santander N° 9812401"}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                  />
                </label>
              </form>
            </div>

            {/* Pie del modal */}
            <div className="flex items-center justify-between border-t border-border p-4 bg-muted/20">
              <div className="text-xs text-muted-foreground">
                Total a pagar: <strong className="text-foreground">{formatClp(selectedTotal)}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  form="grouped-settle-form"
                  type="submit"
                  disabled={isPending || selectedIds.length === 0 || (paymentMethod === "transfer" && !selectedFile)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Registrando Pago...
                    </>
                  ) : (
                    `Confirmar Pago (${selectedIds.length}) · ${formatClp(selectedTotal)}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Alias para retrocompatibilidad
export const GroupedSettleReimbursementModal = CollaboratorReimbursementCard;


