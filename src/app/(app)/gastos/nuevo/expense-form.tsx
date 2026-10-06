"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Upload, AlertTriangle, FileText, CheckCircle2, Sparkles, Loader2, WifiOff, Save } from "lucide-react";
import { addExpense } from "../actions";
import { formatRut } from "@/lib/format";
import { cacheCatalogs, getCachedCatalogs, saveOfflineExpense } from "@/lib/offline-expenses";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string };
type Department = { id: string; name: string; code: string };
type Category = { id: string; name: string };
type ReceiptType = { id: string; name: string; code: string; requires_receipt: boolean };
type ActiveFund = {
  id: string;
  purpose: string;
  current_balance: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  companies?: any;
};

type Props = {
  companies: Company[];
  departments: Department[];
  categories: Category[];
  receiptTypes: ReceiptType[];
  activeFunds: ActiveFund[];
  initialFundId?: string;
};

export function ExpenseForm({
  companies: initialCompanies,
  departments: initialDepartments,
  categories: initialCategories,
  receiptTypes: initialReceiptTypes,
  activeFunds: initialActiveFunds,
  initialFundId,
}: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [receiptTypes, setReceiptTypes] = useState<ReceiptType[]>(initialReceiptTypes);
  const [activeFunds, setActiveFunds] = useState<ActiveFund[]>(initialActiveFunds);

  const [isOnline, setIsOnline] = useState(true);
  const [offlineSavedSuccess, setOfflineSavedSuccess] = useState(false);
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null);

  const [reportType, setReportType] = useState<"reimbursement" | "fund_rendition">(
    initialFundId ? "fund_rendition" : "reimbursement"
  );
  const [selectedFundId, setSelectedFundId] = useState<string>(initialFundId || (initialActiveFunds[0]?.id ?? ""));
  const [selectedReceiptTypeId, setSelectedReceiptTypeId] = useState<string>(
    initialReceiptTypes[0]?.id || ""
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    initialCompanies[0]?.id || ""
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(
    initialDepartments[0]?.id || ""
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    initialCategories[0]?.id || ""
  );

  // Inicializar y sincronizar catálogos locales para uso offline
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (initialCompanies.length > 0) {
      cacheCatalogs({
        companies: initialCompanies,
        departments: initialDepartments,
        categories: initialCategories,
        receiptTypes: initialReceiptTypes,
        activeFunds: initialActiveFunds,
      });
    } else {
      // Cargar desde cache local si se abrió sin conexión
      getCachedCatalogs().then((cached) => {
        if (cached) {
          setCompanies(cached.companies || []);
          setDepartments(cached.departments || []);
          setCategories(cached.categories || []);
          setReceiptTypes(cached.receiptTypes || []);
          setActiveFunds(cached.activeFunds || []);
          if (cached.companies?.[0]) setSelectedCompanyId(cached.companies[0].id);
          if (cached.departments?.[0]) setSelectedDepartmentId(cached.departments[0].id);
          if (cached.categories?.[0]) setSelectedCategoryId(cached.categories[0].id);
          if (cached.receiptTypes?.[0]) setSelectedReceiptTypeId(cached.receiptTypes[0].id);
        }
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [initialCompanies, initialDepartments, initialCategories, initialReceiptTypes, initialActiveFunds]);

  // Campos del formulario editables y autocompletables por OCR
  const [dateStr, setDateStr] = useState(new Date().toISOString().split("T")[0]);
  const [totalStr, setTotalStr] = useState("");
  const [taxStr, setTaxStr] = useState("");
  const [rutInput, setRutInput] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const currentReceiptType = receiptTypes.find((r) => r.id === selectedReceiptTypeId);
  const requiresReceipt = currentReceiptType?.requires_receipt ?? true;

  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setTotalStr("");
      setTaxStr("");
      return;
    }
    const num = Number(raw);
    setTotalStr(new Intl.NumberFormat("es-CL").format(num));

    // Si es factura o boleta con IVA estimado, calcular 19%
    const net = Math.round(num / 1.19);
    const iva = num - net;
    setTaxStr(new Intl.NumberFormat("es-CL").format(iva));
  };

  const handleTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setTaxStr(raw ? new Intl.NumberFormat("es-CL").format(Number(raw)) : "");
  };

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/[^0-9kK]/g, "");
    if (clean.length <= 9) {
      setRutInput(formatRut(clean));
    }
  };

  // Disparo automático de OCR al seleccionar archivo o tomar foto
  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;

    setSelectedFileObj(file);
    setFileName(file.name);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    if (!navigator.onLine) {
      setOcrMessage({
        text: "Modo Sin Conexión (Terreno): Imagen guardada. Completa los montos manualmente para almacenar en tu dispositivo.",
        type: "info",
      });
      return;
    }

    // Iniciar OCR con IA
    setIsOcrLoading(true);
    setOcrMessage({ text: "Analizando documento con Inteligencia Artificial...", type: "info" });

    try {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body,
      });

      const resJson = await res.json();

      if (res.ok && resJson.data) {
        const d = resJson.data;

        if (d.supplier_name) setSupplierName(d.supplier_name);
        if (d.supplier_rut) setRutInput(formatRut(d.supplier_rut));
        if (d.invoice_number) setInvoiceNumber(String(d.invoice_number));
        if (d.date) setDateStr(d.date);
        if (d.description) setDescription(d.description);

        if (d.total_amount) {
          setTotalStr(new Intl.NumberFormat("es-CL").format(d.total_amount));
          const tax = d.tax_amount || Math.round(d.total_amount - d.total_amount / 1.19);
          setTaxStr(new Intl.NumberFormat("es-CL").format(tax));
        }

        // 1. Seleccionar tipo de comprobante coincidente
        if (d.receipt_type_code) {
          const matched = receiptTypes.find((r) => r.code === d.receipt_type_code);
          if (matched) setSelectedReceiptTypeId(matched.id);
        }

        // 2. Autodetectar Empresa Compradora si viene en la factura
        if (d.buyer_name || d.buyer_rut) {
          const buyerNameUpper = (d.buyer_name || "").toUpperCase();

          const matchedCompany = companies.find((c) => {
            const compNameUpper = c.name.toUpperCase();
            if (buyerNameUpper.includes("MINERQUIM") && compNameUpper.includes("MINERQUIM")) return true;
            if (buyerNameUpper.includes("COMERCIALIZADORA") && compNameUpper.includes("COMERCIALIZADORA")) return true;
            if (compNameUpper.split(" ").some((w) => w.length > 4 && buyerNameUpper.includes(w))) return true;
            return false;
          });

          if (matchedCompany) {
            setSelectedCompanyId(matchedCompany.id);
          }
        }

        // 3. Autodetectar Categoría sugerida
        if (d.category_suggestion) {
          const catUpper = d.category_suggestion.toUpperCase();
          const matchedCategory = categories.find((c) => {
            const nameUpper = c.name.toUpperCase();
            return catUpper.includes(nameUpper) || nameUpper.includes(catUpper);
          });
          if (matchedCategory) {
            setSelectedCategoryId(matchedCategory.id);
          }
        }

        setOcrMessage({
          text: "✨ Datos de la factura extraídos automáticamente con IA. Revisa y confirma.",
          type: "success",
        });
      } else {
        if (resJson.error?.includes("GEMINI_API_KEY")) {
          setOcrMessage({
            text: "Configura GEMINI_API_KEY en .env.local para autocompletar con IA. Puedes ingresar los datos manualmente.",
            type: "info",
          });
        } else {
          setOcrMessage({
            text: "No se pudieron extraer todos los datos automáticamente. Puedes completarlos a mano.",
            type: "info",
          });
        }
      }
    } catch {
      setOcrMessage({
        text: "No fue posible procesar el OCR automático. Por favor completa los campos manualmente.",
        type: "info",
      });
    } finally {
      setIsOcrLoading(false);
    }
  };

  // Manejo de pegado con Ctrl + V desde el portapapeles
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          if (fileInputRef.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInputRef.current.files = dt.files;
          }
          handleFileSelected(file);
          break;
        }
      }
    }
  };

  // Guardado sin conexión en terreno (IndexedDB)
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (!isOnline) {
      e.preventDefault();
      const cleanTotal = Number(totalStr.replace(/\D/g, ""));
      const cleanTax = Number(taxStr.replace(/\D/g, "")) || 0;

      if (!cleanTotal || cleanTotal <= 0) {
        alert("Por favor ingresa un monto total válido.");
        return;
      }

      let receiptBase64: string | undefined = undefined;
      if (selectedFileObj) {
        const reader = new FileReader();
        receiptBase64 = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(selectedFileObj);
        });
      }

      const compObj = companies.find((c) => c.id === selectedCompanyId);
      const depObj = departments.find((d) => d.id === selectedDepartmentId);
      const catObj = categories.find((c) => c.id === selectedCategoryId);
      const recObj = receiptTypes.find((r) => r.id === selectedReceiptTypeId);

      await saveOfflineExpense({
        report_type: reportType,
        fund_id: reportType === "fund_rendition" ? selectedFundId : undefined,
        total_amount: cleanTotal,
        tax_amount: cleanTax,
        supplier_name: supplierName || "Proveedor en terreno",
        supplier_rut: rutInput,
        invoice_number: invoiceNumber,
        description: description,
        date: dateStr,
        company_id: selectedCompanyId,
        company_name: compObj?.name,
        department_id: selectedDepartmentId,
        department_name: depObj?.name,
        category_id: selectedCategoryId,
        category_name: catObj?.name,
        receipt_type_id: selectedReceiptTypeId,
        receipt_type_name: recObj?.name,
        receipt_base64: receiptBase64,
        receipt_name: selectedFileObj?.name,
        receipt_type_mime: selectedFileObj?.type,
      });

      setOfflineSavedSuccess(true);
    }
  };

  const selectedFund = activeFunds.find((f) => f.id === selectedFundId);

  if (offlineSavedSuccess) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-center shadow-lg space-y-5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <CheckCircle2 size={36} />
        </div>
        <div>
          <h2 className="text-xl font-bold">¡Gasto guardado en tu dispositivo!</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            El gasto quedó almacenado de forma segura en tu teléfono/computador sin conexión. Se sincronizará automáticamente apenas recuperes señal a internet.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
          <button
            type="button"
            onClick={() => {
              setOfflineSavedSuccess(false);
              setTotalStr("");
              setTaxStr("");
              setRutInput("");
              setSupplierName("");
              setInvoiceNumber("");
              setDescription("");
              setPreviewUrl(null);
              setSelectedFileObj(null);
              setFileName(null);
            }}
            className="w-full sm:w-auto rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-brand-600"
          >
            📸 Registrar Otro Gasto en Terreno
          </button>
          <button
            type="button"
            onClick={() => router.push("/gastos")}
            className="w-full sm:w-auto rounded-xl border border-border bg-background px-6 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            Ver Mis Gastos
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={addExpense} onSubmit={handleSubmit} onPaste={handlePaste} className="space-y-6">
      {/* Aviso Modo Offline si está desconectado */}
      {!isOnline && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <WifiOff size={20} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-bold">Modo Terreno Sin Conexión Activado</p>
            <p className="text-xs opacity-90">
              Puedes capturar la foto y llenar los montos. Se guardará localmente en tu equipo.
            </p>
          </div>
        </div>
      )}
      <input type="hidden" name="report_type" value={reportType} />
      {reportType === "fund_rendition" && (
        <input type="hidden" name="fund_id" value={selectedFundId} />
      )}

      {/* 1. Selección de Modalidad: Reembolso vs Fondo */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Modalidad del Gasto
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setReportType("reimbursement")}
            className={`rounded-xl border p-3.5 text-left text-sm font-semibold transition ${
              reportType === "reimbursement"
                ? "border-primary bg-brand-50/50 text-primary ring-2 ring-primary/20 dark:bg-brand-950/30"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="block font-bold">1. Reembolso Posterior</span>
            <span className="text-xs font-normal opacity-80">Pagado con dinero personal</span>
          </button>

          <button
            type="button"
            onClick={() => setReportType("fund_rendition")}
            disabled={activeFunds.length === 0}
            className={`rounded-xl border p-3.5 text-left text-sm font-semibold transition disabled:opacity-40 ${
              reportType === "fund_rendition"
                ? "border-primary bg-brand-50/50 text-primary ring-2 ring-primary/20 dark:bg-brand-950/30"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="block font-bold">2. Fondo por Rendir</span>
            <span className="text-xs font-normal opacity-80">
              {activeFunds.length > 0
                ? `${activeFunds.length} fondo(s) disponible(s)`
                : "No tienes fondos activos"}
            </span>
          </button>
        </div>

        {reportType === "fund_rendition" && activeFunds.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Selecciona el Fondo Asignado
            </span>
            <select
              value={selectedFundId}
              onChange={(e) => setSelectedFundId(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            >
              {activeFunds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.purpose} — Saldo: ${new Intl.NumberFormat("es-CL").format(f.current_balance)}
                </option>
              ))}
            </select>
            {selectedFund && (
              <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Saldo disponible actual en este fondo: ${new Intl.NumberFormat("es-CL").format(selectedFund.current_balance)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 2. Captura / Adjuntar Comprobante con OCR Automático */}
      {requiresReceipt && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Comprobante / Documento Tributario
            </label>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
              <Sparkles size={13} /> Extracción automática con IA
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            name="receipt_file"
            accept="image/*,application/pdf,.xml"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            name="receipt_camera_file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
            className="hidden"
          />

          {!previewUrl && !fileName ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/50 bg-brand-50/30 p-6 text-center transition hover:bg-brand-50 dark:bg-brand-950/20 active:scale-95"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-md">
                  <Camera size={24} />
                </span>
                <span className="font-semibold text-foreground">Tomar Foto con Cámara</span>
                <span className="text-xs text-muted-foreground">Disparo directo en celular + OCR IA</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background p-6 text-center transition hover:border-primary active:scale-95"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Upload size={24} />
                </span>
                <span className="font-semibold text-foreground">Subir Archivo o PDF</span>
                <span className="text-xs text-muted-foreground">JPG, PNG, PDF o XML DTE chileno</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row">
                {previewUrl ? (
                  <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-border bg-surface">
                    <Image src={previewUrl} alt="Comprobante" fill className="object-cover" />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-brand-50 text-primary dark:bg-brand-950">
                    <FileText size={32} />
                  </div>
                )}
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex items-center justify-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 sm:justify-start">
                    <CheckCircle2 size={16} /> Comprobante cargado
                  </div>
                  <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground">{fileName}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewUrl(null);
                      setFileName(null);
                      setOcrMessage(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                      if (cameraInputRef.current) cameraInputRef.current.value = "";
                    }}
                    className="mt-2 text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Cambiar o eliminar comprobante
                  </button>
                </div>
              </div>

              {isOcrLoading && (
                <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-xs font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 animate-pulse">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Analizando documento con Inteligencia Artificial...</span>
                </div>
              )}

              {ocrMessage && !isOcrLoading && (
                <div
                  className={`rounded-xl p-3 text-xs font-medium ${
                    ocrMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
                      : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900"
                  }`}
                >
                  {ocrMessage.text}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Datos del Gasto y Clasificación */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Clasificación y Detalle
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Empresa Compradora
            </span>
            <select
              name="company_id"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            >
              <option value="">— Selecciona la empresa —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Área / Centro de Costo
            </span>
            <select
              name="department_id"
              value={selectedDepartmentId}
              onChange={(e) => setSelectedDepartmentId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            >
              <option value="">— Selecciona el área —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Categoría
            </span>
            <select
              name="category_id"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            >
              <option value="">— Selecciona la categoría —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Tipo de Comprobante
            </span>
            <select
              name="receipt_type_id"
              value={selectedReceiptTypeId}
              onChange={(e) => setSelectedReceiptTypeId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            >
              {receiptTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name} {!rt.requires_receipt ? "(Sin respaldo)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Advertencia especial para Sin Comprobante */}
        {!requiresReceipt && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
              <AlertTriangle size={16} /> Gasto sin Comprobante Tributario
            </div>
            <p className="mt-1">
              Este tipo de gasto requiere justificación obligatoria y será revisado minuciosamente por los aprobadores.
            </p>
          </div>
        )}

        {/* Montos y Fecha */}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Fecha del Gasto
            </span>
            <input
              name="date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Monto Total (Con IVA Incluido) *
            </span>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-semibold text-muted-foreground">
                $
              </span>
              <input
                name="total_amount"
                type="text"
                inputMode="numeric"
                required
                value={totalStr}
                onChange={handleTotalChange}
                placeholder="0"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-8 pr-4 text-base font-bold outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              IVA (19% Incluido)
            </span>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-semibold text-muted-foreground">
                $
              </span>
              <input
                name="tax_amount"
                type="text"
                inputMode="numeric"
                value={taxStr}
                onChange={handleTaxChange}
                placeholder="0"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-8 pr-4 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </label>
        </div>

        {totalStr && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
            <span>
              <strong>Neto:</strong> $ {new Intl.NumberFormat("es-CL").format(Math.round((Number(totalStr.replace(/\D/g, "")) || 0) / 1.19))}
            </span>
            <span>+</span>
            <span>
              <strong>IVA (19%):</strong> $ {taxStr || "0"}
            </span>
            <span>=</span>
            <span className="font-bold text-foreground">
              <strong>Total Bruto:</strong> $ {totalStr}
            </span>
          </div>
        )}

        {/* Proveedor y Folio */}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              RUT Proveedor (Opcional)
            </span>
            <input
              name="supplier_rut"
              type="text"
              value={rutInput}
              onChange={handleRutChange}
              placeholder="76.123.456-7"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Nombre / Razón Social Proveedor
            </span>
            <input
              name="supplier_name"
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Ej: DISTRIBUIDORA ASTORGA SPA"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              N° Boleta / Factura / Folio
            </span>
            <input
              name="invoice_number"
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ej: 35814"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
            />
          </label>
        </div>

        {/* Justificación obligatoria para Sin Comprobante */}
        {!requiresReceipt && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-amber-800 dark:text-amber-300">
              Justificación de Gasto sin Comprobante (Obligatoria) *
            </span>
            <textarea
              name="justification"
              rows={2}
              required
              placeholder="Ej: Propina en restaurante con cliente, propina peoneta carga de insumos..."
              className="w-full rounded-xl border border-amber-300 bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-brand-200 dark:border-amber-800"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
            Descripción o Glosa Adicional (Opcional)
          </span>
          <textarea
            name="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles sobre los ítems comprados o contexto del gasto..."
            className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
          />
        </label>
      </div>

      {/* Botón de Enviar */}
      <div className="flex justify-end gap-3">
        <button
          type="submit"
          className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3 text-base font-bold text-white shadow-lg transition hover:bg-brand-600 active:scale-95"
        >
          {!isOnline && <Save size={18} />}
          {isOnline ? "Guardar Gasto" : "Guardar en Terreno (Sin Conexión)"}
        </button>
      </div>
    </form>
  );
}
