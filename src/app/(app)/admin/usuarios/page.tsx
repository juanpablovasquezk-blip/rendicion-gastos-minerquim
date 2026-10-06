import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import { createUser, updateUser } from "../actions";
import { Card, ErrorBanner, Field, btnCls, btnGhostCls, inputCls } from "../ui";

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await createClient();
  const [{ data: users }, { data: deps }, { data: companies }, { data: links }] = await Promise.all([
    sb.from("profiles").select("*").order("full_name"),
    sb.from("departments").select("id, name").eq("is_active", true).order("name"),
    sb.from("companies").select("id, name").eq("is_active", true).order("name"),
    sb.from("user_companies").select("user_id, company_id"),
  ]);

  const companiesOf = (uid: string) => new Set(links?.filter((l) => l.user_id === uid).map((l) => l.company_id));

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} />
      <Card title="Crear usuario">
        <form action={createUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre completo"><input name="full_name" required className={inputCls} /></Field>
          <Field label="Correo"><input name="email" type="email" required className={inputCls} /></Field>
          <Field label="Contraseña temporal (mín. 8)"><input name="password" type="text" minLength={8} required className={inputCls} autoComplete="off" /></Field>
          <Field label="Teléfono (WhatsApp)"><input name="phone" className={inputCls} placeholder="+56912345678" /></Field>
          <Field label="Rol">
            <select name="role" defaultValue="employee" className={inputCls}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><button className={btnCls}>Crear usuario</button></div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Entrégale al usuario su correo y la contraseña temporal. Después de crearlo, asígnale área y empresas en la lista de abajo.
        </p>
      </Card>

      <Card title={`Usuarios (${users?.length ?? 0})`}>
        <div className="space-y-4">
          {users?.map((u) => {
            const mine = companiesOf(u.id);
            return (
              <form key={u.id} action={updateUser} className="rounded-xl border border-border p-4">
                <input type="hidden" name="id" value={u.id} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nombre"><input name="full_name" defaultValue={u.full_name} required className={inputCls} /></Field>
                  <Field label="Correo"><input name="email" type="email" defaultValue={u.email} required className={inputCls} /></Field>
                  <Field label="Nueva contraseña (dejar en blanco para no cambiar)">
                    <input name="password" type="password" minLength={8} placeholder="••••••••" className={inputCls} autoComplete="new-password" />
                  </Field>
                  <Field label="Teléfono"><input name="phone" defaultValue={u.phone ?? ""} className={inputCls} /></Field>
                  <Field label="Rol">
                    <select name="role" defaultValue={u.role} className={inputCls}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </Field>
                  <Field label="Área">
                    <select name="department_id" defaultValue={u.department_id ?? ""} className={inputCls}>
                      <option value="">— Sin área —</option>
                      {deps?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Supervisor">
                    <select name="supervisor_id" defaultValue={u.supervisor_id ?? ""} className={inputCls}>
                      <option value="">— Sin supervisor —</option>
                      {users?.filter((x) => x.id !== u.id).map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                    </select>
                  </Field>
                  <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" name="is_active" defaultChecked={u.is_active} /> Cuenta activa</label>
                </div>

                <fieldset className="mt-3">
                  <legend className="mb-1 text-xs font-medium text-muted-foreground">Puede comprar a nombre de</legend>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {!companies?.length && <span className="text-xs text-muted-foreground">Primero crea empresas en la pestaña Empresas.</span>}
                    {companies?.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="company_ids" value={c.id} defaultChecked={mine.has(c.id)} /> {c.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-4"><button className={btnGhostCls}>Guardar cambios</button></div>
              </form>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
