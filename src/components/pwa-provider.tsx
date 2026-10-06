"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff, Wifi, RefreshCw, X, CheckCircle, Share } from "lucide-react";
import { getOfflineExpenses, deleteOfflineExpense, base64ToFile } from "@/lib/offline-expenses";
import { addExpense } from "@/app/(app)/gastos/actions";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

  // 1. Registro del Service Worker y detección online/offline
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);

      const handleOnline = () => {
        setIsOnline(true);
        refreshOfflineCount();
      };
      const handleOffline = () => {
        setIsOnline(false);
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // Registrar Service Worker
      if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((err) => console.log("SW error:", err));
      }

      // Detectar prompt de instalación PWA
      const handleBeforeInstall = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
        setShowInstallBanner(true);
      };

      window.addEventListener("beforeinstallprompt", handleBeforeInstall);

      // Detectar si es iOS para mostrar guía si no está instalada
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone;

      if (isIosDevice && !isStandalone) {
        setIsIos(true);
      }

      // Escuchar cambios en la cola offline
      const updateCount = () => refreshOfflineCount();
      window.addEventListener("offline-expenses-changed", updateCount);

      refreshOfflineCount();

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
        window.removeEventListener("offline-expenses-changed", updateCount);
      };
    }
  }, []);

  const refreshOfflineCount = async () => {
    try {
      const items = await getOfflineExpenses();
      setOfflineCount(items.length);
    } catch {
      // ignore
    }
  };

  // Instalar en Android/Desktop
  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  // Sincronizar gastos offline cuando hay internet
  const handleSyncNow = async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    setSyncStatusMessage("Sincronizando gastos pendientes...");

    try {
      const items = await getOfflineExpenses();
      let successCount = 0;

      for (const item of items) {
        const formData = new FormData();
        formData.append("report_type", item.report_type);
        if (item.fund_id) formData.append("fund_id", item.fund_id);
        formData.append("date", item.date);
        formData.append("total_amount", String(item.total_amount));
        formData.append("tax_amount", String(item.tax_amount));
        formData.append("supplier_name", item.supplier_name);
        formData.append("supplier_rut", item.supplier_rut);
        formData.append("invoice_number", item.invoice_number);
        formData.append("company_id", item.company_id);
        formData.append("department_id", item.department_id);
        formData.append("category_id", item.category_id);
        formData.append("receipt_type_id", item.receipt_type_id);
        if (item.description) formData.append("description", item.description);

        if (item.receipt_base64 && item.receipt_name) {
          const file = base64ToFile(item.receipt_base64, item.receipt_name, item.receipt_type_mime || "image/jpeg");
          formData.append("receipt_file", file);
        }

        try {
          await addExpense(formData);
          await deleteOfflineExpense(item.id);
          successCount++;
        } catch (err) {
          console.error("Error al sincronizar gasto offline:", item.id, err);
        }
      }

      await refreshOfflineCount();
      setSyncStatusMessage(`¡${successCount} gasto(s) sincronizado(s) exitosamente!`);
      setTimeout(() => setSyncStatusMessage(null), 4000);
    } catch (err) {
      console.error("Error general de sincronización:", err);
      setSyncStatusMessage("Error al sincronizar algunos gastos. Reintentaremos luego.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      {children}

      {/* 1. Indicador de Estado de Conexión */}
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-transform animate-in slide-in-from-top">
          <div className="flex items-center gap-2">
            <WifiOff size={16} className="animate-pulse" />
            <span>Modo Sin Conexión (Terreno) — Tus registros se guardarán localmente</span>
          </div>
          {offlineCount > 0 && (
            <span className="rounded-full bg-amber-800 px-2.5 py-0.5 text-[11px]">
              {offlineCount} pendiente(s)
            </span>
          )}
        </div>
      )}

      {/* 2. Banner de Sincronización cuando se recupera internet y hay pendientes */}
      {isOnline && offlineCount > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-primary/30 bg-surface p-4 shadow-xl ring-1 ring-black/5 md:bottom-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wifi size={20} />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {offlineCount} {offlineCount === 1 ? "gasto guardado" : "gastos guardados"} en terreno
                </p>
                <p className="text-xs text-muted-foreground">
                  {syncStatusMessage || "Conexión disponible. ¿Deseas subirlos ahora a la plataforma?"}
                </p>
              </div>
            </div>
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Subiendo..." : "Sincronizar"}
            </button>
          </div>
        </div>
      )}

      {/* 3. Mensaje de éxito tras sincronización */}
      {syncStatusMessage && offlineCount === 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow-xl dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 md:bottom-6">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-bold">{syncStatusMessage}</p>
          </div>
        </div>
      )}

      {/* 4. Banner de Instalación PWA (Android / Chrome) */}
      {showInstallBanner && (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-2xl ring-1 ring-black/5 md:bottom-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white font-bold text-lg">
                M
              </div>
              <div>
                <p className="text-sm font-bold">Instalar App Minerquim</p>
                <p className="text-xs text-muted-foreground">Acceso rápido y funcionamiento sin conexión</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleInstallApp}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-brand-600"
              >
                <Download size={14} />
                Instalar
              </button>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Guía de Instalación para iPhone / iPad */}
      {isIos && !showIosGuide && (
        <button
          onClick={() => setShowIosGuide(true)}
          className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-xs font-semibold text-foreground border border-border shadow-lg md:hidden"
        >
          <Download size={14} className="text-primary" />
          Instalar en iPhone
        </button>
      )}

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Instalar en tu iPhone</h3>
              <button onClick={() => setShowIosGuide(false)} className="text-muted-foreground">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Para tener acceso directo en tu pantalla de inicio como una aplicación nativa:
            </p>
            <ol className="space-y-2.5 text-xs">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-bold">1</span>
                <span>Toca el botón <strong className="text-foreground">Compartir</strong> (<Share size={13} className="inline mx-0.5 text-blue-500" />) en la barra de Safari.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-bold">2</span>
                <span>Desliza hacia abajo y selecciona <strong className="text-foreground">"Agregar a inicio"</strong>.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-bold">3</span>
                <span>Toca <strong className="text-foreground">"Agregar"</strong> en la esquina superior derecha.</span>
              </li>
            </ol>
            <button
              onClick={() => setShowIosGuide(false)}
              className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-white shadow"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
