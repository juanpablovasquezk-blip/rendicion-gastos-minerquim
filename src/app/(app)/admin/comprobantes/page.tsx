import { createClient } from "@/lib/supabase/server";
import { toggleReceiptType } from "../actions";
import { Card, ErrorBanner, btnGhostCls } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await createClient();
  const { data: types } = await sb.from("receipt_types").select("*").order("name");

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} />
      <Card title="Tipos de comprobante">
        <p className="mb-4 text-sm text-muted-foreground">
          Activa o desactiva los tipos que pueden usar los colaboradores. “Sin comprobante” exige justificación obligatoria.
        </p>
        <div className="divide-y divide-border">
          {types?.map((t) => (
            <form key={t.id} action={toggleReceiptType} className="flex items-center justify-between gap-3 py-3">
              <input type="hidden" name="id" value={t.id} />
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.sii_code ? `Código SII ${t.sii_code}` : "Sin código SII"} · {t.requires_receipt ? "Requiere respaldo" : "Sin respaldo"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={t.is_active} /> Activo</label>
                <button className={btnGhostCls}>Guardar</button>
              </div>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}
