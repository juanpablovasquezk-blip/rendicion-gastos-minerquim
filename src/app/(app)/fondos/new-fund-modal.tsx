"use client";

import { useState } from "react";
import { Plus, X, Wallet } from "lucide-react";
import { requestFund } from "./actions";

type Company = { id: string; name: string };

export function NewFundModal({ companies }: { companies: Company[] }) {
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("");

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setAmountStr("");
      return;
    }
    const num = Number(raw);
    setAmountStr(new Intl.NumberFormat("es-CL").format(num));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600 active:scale-95"
      >
        <Plus size={18} strokeWidth={2.5} />
        Solicitar Fondo
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-primary dark:bg-brand-950">
                  <Wallet size={20} />
                </span>
                <div>
                  <h2 className="text-lg font-bold">Solicitud de Fondo por Rendir</h2>
                  <p className="text-xs text-muted-foreground">Pasa por aprobación de Operaciones y Gerencia General</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <form action={requestFund} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Empresa a la que se cargará el fondo
                </span>
                <select
                  name="company_id"
                  required
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                >
                  <option value="">— Selecciona una empresa —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {companies.length === 0 && (
                  <p className="mt-1 text-xs text-rose-500">
                    No tienes empresas asignadas. Solicita al administrador que te asigne una empresa.
                  </p>
                )}
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Monto solicitado (CLP)
                </span>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-semibold text-muted-foreground">
                    $
                  </span>
                  <input
                    name="requested_amount"
                    type="text"
                    inputMode="numeric"
                    required
                    value={amountStr}
                    onChange={handleAmountChange}
                    placeholder="500.000"
                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-8 pr-4 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Motivo o justificación de la solicitud
                </span>
                <textarea
                  name="purpose"
                  rows={3}
                  required
                  placeholder="Ej: Viáticos y compras de insumos para viaje a faena Minera El Peñón semana 42..."
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-brand-200"
                />
              </label>

              <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={companies.length === 0}
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600 disabled:opacity-50"
                >
                  Enviar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
