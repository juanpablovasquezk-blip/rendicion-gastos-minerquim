export const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-brand-200";

export const btnCls =
  "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600";

export const btnGhostCls =
  "rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary hover:text-primary";

export function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {title && <h2 className="mb-4 text-base font-semibold">{title}</h2>}
      {children}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const clp = (n: number | null) => (n == null ? "" : new Intl.NumberFormat("es-CL").format(n));
