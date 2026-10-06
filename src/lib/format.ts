/** Formato de moneda chilena: $ 1.250.000 */
export function formatClp(amount: number | null | undefined): string {
  if (amount == null) return "$ 0";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Formato de fecha chilena: 06/10/2026 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  const [year, month, day] = dateString.split("T")[0].split("-");
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

/** Formatea RUT a 12.345.678-K */
export function formatRut(rut: string | null | undefined): string {
  if (!rut) return "—";
  const clean = rut.replace(/[^0-9kK]/g, "");
  if (clean.length < 2) return rut;
  const dv = clean.slice(-1).toUpperCase();
  const num = clean.slice(0, -1);
  return `${new Intl.NumberFormat("es-CL").format(Number(num))}-${dv}`;
}

/** Limpia y normaliza RUT para almacenamiento (12345678-K) */
export function normalizeRut(rut: string): string {
  const clean = rut.replace(/[^0-9kK]/g, "");
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1).toUpperCase()}`;
}

/** Etiquetas legibles y colores para estados de fondos */
export const FUND_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  requested: { label: "Solicitado", bg: "bg-amber-100 dark:bg-amber-950/50", text: "text-amber-800 dark:text-amber-300" },
  approved: { label: "Aprobado (Por depositar)", bg: "bg-blue-100 dark:bg-blue-950/50", text: "text-blue-800 dark:text-blue-300" },
  active: { label: "Activo (Depositado)", bg: "bg-emerald-100 dark:bg-emerald-950/50", text: "text-emerald-800 dark:text-emerald-300" },
  closed: { label: "Cerrado", bg: "bg-purple-100 dark:bg-purple-950/50", text: "text-purple-800 dark:text-purple-300" },
  settled: { label: "Liquidado", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-800 dark:text-slate-300" },
  rejected: { label: "Rechazado", bg: "bg-rose-100 dark:bg-rose-950/50", text: "text-rose-800 dark:text-rose-300" },
  cancelled: { label: "Cancelado", bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" },
};

/** Etiquetas y colores para estados de informes */
export const REPORT_STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  draft: { label: "Borrador", bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300" },
  submitted: { label: "En Revisión", bg: "bg-amber-100 dark:bg-amber-950/50", text: "text-amber-800 dark:text-amber-300" },
  partially_approved: { label: "Con Observaciones", bg: "bg-orange-100 dark:bg-orange-950/50", text: "text-orange-800 dark:text-orange-300" },
  approved: { label: "Aprobado", bg: "bg-emerald-100 dark:bg-emerald-950/50", text: "text-emerald-800 dark:text-emerald-300" },
  rejected: { label: "Rechazado", bg: "bg-rose-100 dark:bg-rose-950/50", text: "text-rose-800 dark:text-rose-300" },
  settled: { label: "Liquidado / Pagado", bg: "bg-blue-100 dark:bg-blue-950/50", text: "text-blue-800 dark:text-blue-300" },
};
