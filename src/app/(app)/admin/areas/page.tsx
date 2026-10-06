import { createClient } from "@/lib/supabase/server";
import { createDepartment, updateDepartment } from "../actions";
import { Card, ErrorBanner, Field, btnCls, btnGhostCls, clp, inputCls } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await createClient();
  const { data: deps } = await sb.from("departments").select("*").order("name");

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} />
      <Card title="Agregar área / centro de costo">
        <form action={createDepartment} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_120px_160px_160px_auto] lg:items-end">
          <Field label="Nombre"><input name="name" required className={inputCls} placeholder="Operaciones" /></Field>
          <Field label="Código"><input name="code" required className={inputCls} placeholder="OPE" /></Field>
          <Field label="Presupuesto mensual (CLP)"><input name="monthly_budget" inputMode="numeric" className={inputCls} placeholder="0" /></Field>
          <Field label="Umbral aprobación (CLP)"><input name="approval_threshold" inputMode="numeric" className={inputCls} placeholder="Sin umbral" /></Field>
          <button className={btnCls}>Agregar</button>
        </form>
      </Card>

      <Card title={`Áreas (${deps?.length ?? 0})`}>
        {!deps?.length && <p className="text-sm text-muted-foreground">Aún no hay áreas. Agrega la primera arriba.</p>}
        <div className="divide-y divide-border">
          {deps?.map((d) => (
            <form key={d.id} action={updateDepartment} className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-[1fr_120px_160px_160px_auto_auto] lg:items-end">
              <input type="hidden" name="id" value={d.id} />
              <Field label="Nombre"><input name="name" defaultValue={d.name} required className={inputCls} /></Field>
              <Field label="Código"><input name="code" defaultValue={d.code} required className={inputCls} /></Field>
              <Field label="Presupuesto mensual"><input name="monthly_budget" defaultValue={clp(d.monthly_budget)} inputMode="numeric" className={inputCls} /></Field>
              <Field label="Umbral aprobación"><input name="approval_threshold" defaultValue={clp(d.approval_threshold)} inputMode="numeric" className={inputCls} placeholder="Sin umbral" /></Field>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={d.is_active} /> Activa</label>
              <button className={btnGhostCls}>Guardar</button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
