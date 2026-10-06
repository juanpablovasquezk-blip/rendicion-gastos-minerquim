import { createClient } from "@/lib/supabase/server";
import { createCompany, updateCompany } from "../actions";
import { Card, ErrorBanner, Field, btnCls, btnGhostCls, inputCls } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await createClient();
  const { data: companies } = await sb.from("companies").select("*").order("name");

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} />
      <Card title="Agregar empresa">
        <form action={createCompany} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <Field label="Nombre"><input name="name" required className={inputCls} placeholder="Razón social o nombre de fantasía" /></Field>
          <Field label="RUT (opcional)"><input name="rut" className={inputCls} placeholder="76123456-7" /></Field>
          <button className={btnCls}>Agregar</button>
        </form>
      </Card>

      <Card title={`Empresas del grupo (${companies?.length ?? 0})`}>
        {!companies?.length && <p className="text-sm text-muted-foreground">Aún no hay empresas. Agrega la primera arriba.</p>}
        <div className="divide-y divide-border">
          {companies?.map((c) => (
            <form key={c.id} action={updateCompany} className="grid gap-3 py-3 sm:grid-cols-[1fr_200px_auto_auto] sm:items-end">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Nombre"><input name="name" defaultValue={c.name} required className={inputCls} /></Field>
              <Field label="RUT"><input name="rut" defaultValue={c.rut ?? ""} className={inputCls} /></Field>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={c.is_active} /> Activa</label>
              <button className={btnGhostCls}>Guardar</button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
