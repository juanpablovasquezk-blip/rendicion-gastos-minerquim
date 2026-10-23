"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Loader2, Upload, FileText, CheckCircle2 } from "lucide-react";
import { updateExpenseAction } from "./actions";
import { formatClp } from "@/lib/format";
import { compressImage } from "@/lib/image-compression";

export type ExpenseEditData = {
  id: string;
  date: string;
  total_amount: number;
  tax_amount: number;
  supplier_name?: string | null;
  supplier_rut?: string | null;
  invoice_number?: string | null;
  description?: string | null;
  justification?: string | null;
  company_id?: string | null;
  department_id?: string | null;
  category_id?: string | null;
  receipt_type_id?: string | null;
  has_receipt?: boolean;
};

export function EditExpenseModal({
  expense,
  companies,
  departments,
  categories,
  receiptTypes,
}: {
  expense: ExpenseEditData;
  companies: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; code?: string | null }>;
  categories: Array<{ id: string; name: string }>;
  receiptTypes: Array<{ id: string; name: string; code?: string; requires_receipt: boolean }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [companyId, setCompanyId] = useState(expense.company_id || (companies[0]?.id ?? ""));
  const [departmentId, setDepartmentId] = useState(expense.department_id || (departments[0]?.id ?? ""));
  const [categoryId, setCategoryId] = useState(expense.category_id || (categories[0]?.id ?? ""));
  const [receiptTypeId, setReceiptTypeId] = useState(expense.receipt_type_id || (receiptTypes[0]?.id ?? ""));
  const [date, setDate] = useState(expense.date);
  const [totalAmountStr, setTotalAmountStr] = useState(
    new Intl.NumberFormat("es-CL").format(expense.total_amount)
  );
  const [taxAmountStr, setTaxAmountStr] = useState(
    expense.tax_amount > 0 ? new Intl.NumberFormat("es-CL").format(expense.tax_amount) : ""
  );
  const [supplierName, setSupplierName] = useState(expense.supplier_name || "");
  const [supplierRut, setSupplierRut] = useState(expense.supplier_rut || "");
  const [invoiceNumber, setInvoiceNumber] = useState(expense.invoice_number || "");
  const [description, setDescription] = useState(expense.description || "");
  const [justification, setJustification] = useState(expense.justification || "");

  const [newFile, setNewFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedReceiptType = receiptTypes.find((r) => r.id === receiptTypeId);
  const requiresReceipt = selectedReceiptType?.requires_receipt ?? true;

  const handleOpen = () => {
    setCompanyId(expense.company_id || (companies[0]?.id ?? ""));
    setDepartmentId(expense.department_id || (departments[0]?.id ?? ""));
    setCategoryId(expense.category_id || (categories[0]?.id ?? ""));
    setReceiptTypeId(expense.receipt_type_id || (receiptTypes[0]?.id ?? ""));
    setDate(expense.date);
    setTotalAmountStr(new Intl.NumberFormat("es-CL").format(expense.total_amount));
    setTaxAmountStr(expense.tax_amount > 0 ? new Intl.NumberFormat("es-CL").format(expense.tax_amount) : "");
    setSupplierName(expense.supplier_name || "");
    setSupplierRut(expense.supplier_rut || "");
    setInvoiceNumber(expense.invoice_number || "");
    setDescription(expense.description || "");
    setJustification(expense.justification || "");
    setNewFile(null);
    setFileName(null);
    setErrorMessage(null);
    setOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    let target = f;
    if (f.type.startsWith("image/")) {
      try {
        target = await compressImage(f, { maxWidth: 1920, maxHeight: 1920, quality: 0.82 });
      } catch (err) {
        console.warn("Error comprimiendo comprobante:", err);
      }
    }
    setNewFile(target);
    setFileName(target.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsPending(true);

    try {
      const fd = new FormData();
      fd.set("expense_id", expense.id);
      fd.set("company_id", companyId);
      fd.set("department_id", departmentId);
      fd.set("category_id", categoryId);
      fd.set("receipt_type_id", receiptTypeId);
      fd.set("date", date);
      fd.set("total_amount", totalAmountStr);
      fd.set("tax_amount", taxAmountStr);
      fd.set("supplier_name", supplierName);
      fd.set("supplier_rut", supplierRut);
      fd.set("invoice_number", invoiceNumber);
      fd.set("description", description);
      fd.set("justification", justification);
      if (newFile) {
        fd.set("receipt_file", newFile);
      }

      const res = await updateExpenseAction(fd);
      if (res.success) {
        setOpen(false);
        router.refresh();
      } else {
        setErrorMessage(res.error || "Error al actualizar el gasto.");
        setIsPending(false);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Error al actualizar el gasto.");
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Editar gasto"
        className="rounded-lg p-2 text-primary transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/40 cursor-pointer"
      >
        <Pencil size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl animate-in zoom-in-95">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="space-y-0.5">
                <h2 className="text-base font-bold">Editar Gasto</h2>
                <p className="text-xs text-muted-foreground">
                  Modifica los valores del gasto y su categorización contable
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenido con scroll */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {errorMessage && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                  {errorMessage}
                </div>
              )}

              <form id="edit-expense-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Monto y Fecha */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Monto Total (CLP) *
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-muted-foreground">
                        $
                      </span>
                      <input
                        type="text"
                        required
                        value={totalAmountStr}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          setTotalAmountStr(raw ? new Intl.NumberFormat("es-CL").format(Number(raw)) : "");
                        }}
                        className="w-full rounded-xl border border-border bg-background py-2 pl-7 pr-3 text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      IVA (Opcional)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-muted-foreground">
                        $
                      </span>
                      <input
                        type="text"
                        value={taxAmountStr}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          setTaxAmountStr(raw ? new Intl.NumberFormat("es-CL").format(Number(raw)) : "");
                        }}
                        placeholder="0"
                        className="w-full rounded-xl border border-border bg-background py-2 pl-7 pr-3 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Fecha del Gasto *
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                </div>

                {/* Empresa, Área y Categoría */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Empresa *
                    </label>
                    <select
                      value={companyId}
                      onChange={(e) => setCompanyId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Área / Centro Costo *
                    </label>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.code ? `(${d.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Categoría *
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Tipo de Comprobante */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Tipo de Comprobante *
                  </label>
                  <select
                    value={receiptTypeId}
                    onChange={(e) => setReceiptTypeId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                  >
                    {receiptTypes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {!r.requires_receipt ? "(Sin comprobante)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Proveedor, RUT y Folio */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      Proveedor / Comercio
                    </label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="Ej: Copec, Sodimac"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      RUT Proveedor
                    </label>
                    <input
                      type="text"
                      value={supplierRut}
                      onChange={(e) => setSupplierRut(e.target.value)}
                      placeholder="76.123.456-7"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      N° Factura / Boleta
                    </label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="123456"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                    />
                  </div>
                </div>

                {/* Glosa / Descripción */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Glosa / Descripción del Gasto
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ej: ARREGLO PIOLAS CAMION 47"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                  />
                </div>

                {/* Justificación obligatoria si es sin comprobante */}
                {!requiresReceipt && (
                  <div>
                    <label className="block text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                      Justificación de Gasto sin Comprobante *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Indica el motivo detallado por el cual no se emitió boleta/factura..."
                      className="w-full rounded-xl border border-amber-300 bg-amber-50/50 p-2.5 text-xs outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-amber-900/50 dark:bg-amber-950/20"
                    />
                  </div>
                )}

                {/* Reemplazar Comprobante Opcional */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Reemplazar Comprobante / Archivo (Opcional)
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {!fileName ? (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground hover:bg-muted/40 transition"
                    >
                      <Upload size={15} />
                      <span>Seleccionar nuevo archivo para reemplazar el actual</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-2.5 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                        <span className="truncate font-medium">{fileName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewFile(null);
                          setFileName(null);
                        }}
                        className="text-muted-foreground hover:text-rose-600"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Pie del modal */}
            <div className="flex items-center justify-end gap-2 border-t border-border p-4 bg-muted/20">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                form="edit-expense-form"
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
