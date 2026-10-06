import { createClient } from "@/lib/supabase/server";
import { createCategory, updateCategory } from "../actions";
import { Card, ErrorBanner, Field, btnCls, btnGhostCls, inputCls } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await createClient();
  const { data: cats } = await sb.from("categories").select("*").order("name");

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} />
      <Card title="Agregar categoría">
        <form action={createCategory} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Nombre"><input name="name" required className={inputCls} placeholder="Ej: Herramientas" /></Field>
          <button className={btnCls}>Agregar</button>
        </form>
      </Card>

      <Card title={`Categorías de gasto (${cats?.length ?? 0})`}>
        <div className="divide-y divide-border">
          {cats?.map((c) => (
            <form key={c.id} action={updateCategory} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Nombre"><input name="name" defaultValue={c.name} required className={inputCls} /></Field>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={c.is_active} /> Activa</label>
              <button className={btnGhostCls}>Guardar</button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
