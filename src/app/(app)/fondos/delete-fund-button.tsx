"use client";

import { useState, useTransition } from "react";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { deleteFundRequestAction } from "./actions";
import { formatClp } from "@/lib/format";

interface DeleteFundButtonProps {
  fundId: string;
  purpose: string;
  amount: number;
}

export function DeleteFundButton({ fundId, purpose, amount }: DeleteFundButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const fd = new FormData();
    fd.set("id", fundId);
    startTransition(async () => {
      await deleteFundRequestAction(fd);
      setIsOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Eliminar solicitud"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-rose-950/30"
      >
        <Trash2 size={13} />
        <span>Eliminar</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 className="font-bold text-foreground text-sm">¿Eliminar solicitud de fondo?</h3>
                <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground truncate">{purpose}</p>
              <p className="font-bold text-primary">{formatClp(amount)}</p>
            </div>

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
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {isPending ? "Eliminando..." : "Eliminar Solicitud"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
