"use client";

import { useState } from "react";
import { FileText, Download, Calendar, Users, Filter, X, ChevronRight, CheckCircle2 } from "lucide-react";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}

interface ReportModalProps {
  currentUserId: string;
  currentUserRole: string;
  currentView: string;
  profiles: Profile[];
}

export function ReportModal({
  currentUserId,
  currentUserRole,
  currentView,
  profiles,
}: ReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isGeneralManager = currentUserRole === "general_manager";
  const isManagement =
    currentUserRole === "admin" ||
    currentUserRole === "general_manager" ||
    currentUserRole === "manager";

  // Filter states
  const [filterMode, setFilterMode] = useState<"month" | "range">("month");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Target user: default to 'all' if Gerencia viewing Empresa, otherwise currentUserId
  const [targetUserId, setTargetUserId] = useState<string>(
    isGeneralManager && currentView === "empresa" ? "all" : currentUserId
  );

  const [scope, setScope] = useState<"gerencia" | "operaciones">(
    isGeneralManager && currentView === "empresa" ? "gerencia" : "operaciones"
  );

  // Construct PDF download URL
  const buildDownloadUrl = () => {
    const params = new URLSearchParams();

    if (targetUserId) {
      params.set("userId", targetUserId);
    }

    if (filterMode === "month") {
      params.set("month", selectedMonth);
    } else {
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    }

    params.set("scope", scope);

    return `/api/fondos/informe-pdf?${params.toString()}`;
  };

  return (
    <>
      {/* Botón que abre el modal */}
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs font-bold text-primary shadow-sm transition hover:bg-primary/20 active:scale-95"
        title="Generar y filtrar Informe de Fondos y Gastos en PDF"
      >
        <FileText size={16} />
        <span>Informe PDF</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      {scope === "gerencia"
                        ? "Informe Ejecutivo de Gerencia"
                        : "Informe de Rendición de Gastos"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {scope === "gerencia"
                        ? "Auditoría gerencial consolidada entre fechas o por meses"
                        : "Detalle pormenorizado de fondos depositados y gastos rendidos"}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido del Formulario */}
            <div className="mt-5 space-y-4 text-xs">
              {/* Selector de Perfil / Colaborador (solo gerencia o admin) */}
              {isManagement && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 font-bold text-foreground">
                    <Users size={14} className="text-primary" />
                    Destinatario / Alcance del Informe
                  </label>
                  <select
                    value={targetUserId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTargetUserId(val);
                      if (val === "all") {
                        setScope("gerencia");
                      }
                    }}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-hidden"
                  >
                    {isGeneralManager && (
                      <option value="all">
                        🏢 Toda la Empresa (Consolidado Gerencia General)
                      </option>
                    )}
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        👤 {p.full_name || p.email} ({p.role === "admin" ? "Operaciones/Admin" : p.role === "general_manager" ? "Gerencia General" : "Colaborador"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selector de Modalidad de Período (Por Mes vs Entre Fechas) */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 font-bold text-foreground">
                  <Calendar size={14} className="text-primary" />
                  Rango del Informe
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background p-1">
                  <button
                    type="button"
                    onClick={() => setFilterMode("month")}
                    className={`rounded-lg py-1.5 text-center font-bold transition ${
                      filterMode === "month"
                        ? "bg-primary text-white shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Por Mes
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode("range")}
                    className={`rounded-lg py-1.5 text-center font-bold transition ${
                      filterMode === "range"
                        ? "bg-primary text-white shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Entre Fechas
                  </button>
                </div>
              </div>

              {/* Filtro: Por Mes */}
              {filterMode === "month" && (
                <div>
                  <label className="mb-1.5 block font-bold text-muted-foreground">
                    Selecciona el Mes
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-hidden"
                  >
                    <option value="all">📅 Todos los Meses (Histórico Completo)</option>
                    <option value="2026-11">Noviembre 2026</option>
                    <option value="2026-10">Octubre 2026</option>
                    <option value="2026-09">Septiembre 2026</option>
                  </select>
                </div>
              )}

              {/* Filtro: Entre Fechas */}
              {filterMode === "range" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block font-bold text-muted-foreground">
                      Fecha Desde
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block font-bold text-muted-foreground">
                      Fecha Hasta
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {/* Selector de Tipo de Formato (si aplica a gerencia) */}
              {isManagement && targetUserId !== "all" && (
                <div>
                  <label className="mb-1.5 block font-bold text-muted-foreground">
                    Formato de Presentación
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setScope("operaciones")}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        scope === "operaciones"
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <div className="font-bold">Formato Operaciones</div>
                      <div className="text-[10px] opacity-80">
                        Detalle de comprobantes y cuadre
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("gerencia")}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        scope === "gerencia"
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <div className="font-bold">Formato Gerencial</div>
                      <div className="text-[10px] opacity-80">
                        Control y supervisión de fondos
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Resumen de configuración */}
              <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  <span>Resumen del informe a emitir:</span>
                </div>
                <ul className="mt-1.5 space-y-1 text-muted-foreground text-[11px]">
                  <li>
                    • <strong>Alcance:</strong>{" "}
                    {targetUserId === "all"
                      ? "Consolidado de toda la empresa (Gerencia)"
                      : profiles.find((p) => p.id === targetUserId)?.full_name || "Colaborador"}
                  </li>
                  <li>
                    • <strong>Período:</strong>{" "}
                    {filterMode === "month"
                      ? selectedMonth === "all"
                        ? "Histórico completo"
                        : selectedMonth
                      : `${startDate || "Inicio"} a ${endDate || "Hoy"}`}
                  </li>
                  <li>
                    • <strong>Formato:</strong> PDF oficial con membrete y firmas de aprobación.
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer con botones de acción */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Cancelar
              </button>
              <a
                href={buildDownloadUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-brand-600 active:scale-95"
              >
                <Download size={15} />
                <span>Descargar Informe PDF</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
