"use client";

import { useState, useTransition } from "react";
import { RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { reverseDepositAction } from "./actions";
import { formatClp } from "@/lib/format";

interface ReverseDepositButtonProps {
  fundId: string;
  purpose: string;
  amount: number;
}

export function ReverseDepositButton({ fundId, purpose, amount }: ReverseDepositButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleReverse = () => {
    const fd = new FormData();
    fd.set("id", fundId);
    startTransition(async () => {
      await reverseDepositAction(fd);
      setIsOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Reversar depósito para devolverlo a Gerencia General"
        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 hover:border-amber-400 active:scale-95 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <RotateCcw size={13} />
        <span>Reversar Depósito</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 className="font-bold text-foreground text-sm">¿Reversar depósito de fondo?</h3>
                <p className="text-xs text-muted-foreground">Volverá a estar pendiente de depósito en Gerencia General.</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground truncate">{purpose}</p>
              <p className="font-bold text-primary">{formatClp(amount)}</p>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Se eliminará el comprobante de depósito previo y el fondo volverá a aparecer en la bandeja de Gerencia General para que pueda transferirse correctamente.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold transition hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReverse}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
              >
                {isPending && <Loader2 size={13} className="animate-spin" />}
                Confirmar Reversión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
