export function ComingSoon({ title, hito, children }: { title: string; hito: string; children?: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
        {children ?? "Esta sección se construye en el hito"} <span className="font-semibold text-primary">{hito}</span>.
      </div>
    </section>
  );
}
