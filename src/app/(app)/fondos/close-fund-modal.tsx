"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatClp } from "@/lib/format";
import { closeFundAction } from "./actions";
import { CheckCircle2, AlertCircle, X, ShieldCheck, ArrowRight, Wallet, Receipt, Coins } from "lucide-react";

interface CloseFundModalProps {
  fund: {
    id: string;
    purpose: string;
    initial_amount: number | null;
    current_balance: number;
    user_id: string;
  };
  userPendingReimbursementsTotal?: number;
}

export function CloseFundModal({ fund, userPendingReimbursementsTotal = 0 }: CloseFundModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolutionMode, setResolutionMode] = useState<"net_and_credit" | "net_and_refund">("net_and_credit");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const balance = Number(fund.current_balance || 0);
  const initial = Number(fund.initial_amount || 0);
  const rendered = initial - balance;

  const hasNegativeBalance = balance < 0;
  const hasPositiveBalance = balance > 0;
  const isZeroBalance = balance === 0;

  const deficitAmount = Math.abs(balance);
  const nettedAmount = Math.min(balance > 0 ? balance : 0, userPendingReimbursementsTotal);
  const remainingPositive = Math.max(0, balance - nettedAmount);

  const handleCloseFund = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("fund_id", fund.id);
    formData.set("resolution_mode", resolutionMode);

    startTransition(async () => {
      const res = await closeFundAction(formData);
      if (res.success) {
        setIsOpen(false);
        router.refresh();
      } else {
        setErrorMessage(res.error || "Ocurrió un error al cerrar el fondo.");
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 active:scale-95 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
      >
        <ShieldCheck size={14} />
        Cerrar Fondo
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wallet size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold">Cierre y Liquidación de Fondo</h3>
                  <p className="text-xs text-muted-foreground truncate max-w-xs">{fund.purpose}</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleCloseFund} className="p-5 space-y-4">
              {errorMessage && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Resumen numérico */}
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-center">
                <div>
                  <span className="block text-[11px] text-muted-foreground uppercase font-medium">Entregado</span>
                  <span className="text-xs font-bold text-foreground">{formatClp(initial)}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-muted-foreground uppercase font-medium">Rendido</span>
                  <span className="text-xs font-bold text-foreground">{formatClp(rendered)}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-muted-foreground uppercase font-medium">Saldo Final</span>
                  <span
                    className={`text-xs font-bold ${
                      hasNegativeBalance
                        ? "text-rose-600 dark:text-rose-400"
                        : hasPositiveBalance
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground"
                    }`}
                  >
                    {formatClp(balance)}
                  </span>
                </div>
              </div>

              {/* CASO 1: SALDO NEGATIVO (Déficit a favor del colaborador) */}
              {hasNegativeBalance && (
                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300">
                    <AlertCircle size={16} />
                    <span>Saldo a tu favor por gastar más de lo entregado ({formatClp(deficitAmount)})</span>
                  </div>
                  <p className="text-[12px] leading-relaxed">
                    Al confirmar el cierre de este fondo:
                  </p>
                  <ul className="space-y-1.5 text-[11px] list-disc list-inside">
                    <li>
                      Se creará automáticamente un <strong>Reembolso a tu favor por {formatClp(deficitAmount)}</strong> listo directamente para que Gerencia General te haga la transferencia.
                    </li>
                    <li>
                      El fondo quedará <strong>Cerrado y archivado</strong>, saliendo de tus fondos activos.
                    </li>
                  </ul>
                </div>
              )}

              {/* CASO 2: SALDO POSITIVO (Remanente a favor de la empresa) */}
              {hasPositiveBalance && (
                <div className="space-y-3">
                  {userPendingReimbursementsTotal > 0 && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300 space-y-1">
                      <div className="flex items-center gap-2 font-bold">
                        <Receipt size={15} />
                        <span>Neteo Automático de Reembolsos Pendientes</span>
                      </div>
                      <p className="text-[11px]">
                        Tienes {formatClp(userPendingReimbursementsTotal)} en reembolsos pendientes. Se abonarán automáticamente{" "}
                        <strong>{formatClp(nettedAmount)}</strong> del saldo sobrante de este fondo, dándolos por pagados.
                      </p>
                    </div>
                  )}

                  {remainingPositive > 0 && (
                    <div className="space-y-2 rounded-xl border border-border bg-surface p-3.5">
                      <label className="block text-xs font-bold text-foreground">
                        ¿Qué deseas hacer con el saldo restante de {formatClp(remainingPositive)}?
                      </label>

                      <div className="space-y-2 pt-1">
                        <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition">
                          <input
                            type="radio"
                            name="resolution_mode"
                            value="net_and_credit"
                            checked={resolutionMode === "net_and_credit"}
                            onChange={() => setResolutionMode("net_and_credit")}
                            className="mt-0.5 text-primary focus:ring-primary"
                          />
                          <div className="text-xs">
                            <span className="font-semibold block flex items-center gap-1">
                              <Coins size={14} className="text-amber-500" />
                              Abonar como crédito para mi próxima solicitud de fondo (Recomendado)
                            </span>
                            <span className="text-muted-foreground text-[11px]">
                              Cuando pidas un nuevo fondo, este saldo se descontará de la transferencia que debe hacer Gerencia General.
                            </span>
                          </div>
                        </label>

                        <label className="flex items-start gap-2.5 p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition">
                          <input
                            type="radio"
                            name="resolution_mode"
                            value="net_and_refund"
                            checked={resolutionMode === "net_and_refund"}
                            onChange={() => setResolutionMode("net_and_refund")}
                            className="mt-0.5 text-primary focus:ring-primary"
                          />
                          <div className="text-xs">
                            <span className="font-semibold block">Devolver dinero en efectivo / transferencia a la empresa</span>
                            <span className="text-muted-foreground text-[11px]">
                              Entregarás el dinero sobrante a la administración o gerencia.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CASO 3: SALDO EXACTO $0 */}
              {isZeroBalance && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 size={16} />
                    <span>Fondo completamente rendido al 100%</span>
                  </div>
                  <p className="text-[11px] mt-1">
                    No hay diferencias de saldo. El fondo se cerrará y archivará limpiamente.
                  </p>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-brand-600 active:scale-95 disabled:opacity-50"
                >
                  {isPending ? (
                    "Cerrando fondo..."
                  ) : hasNegativeBalance ? (
                    <>
                      Confirmar Cierre y Pedir Reembolso <ArrowRight size={14} />
                    </>
                  ) : (
                    <>
                      Confirmar Cierre de Fondo <CheckCircle2 size={14} />
                    </>
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
