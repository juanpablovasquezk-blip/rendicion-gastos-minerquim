"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (f: FormData, k: string) => {
  const d = str(f, k).replace(/\D/g, "");
  return d ? Number(d) : null;
};

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function dbFail(path: string, error: { code?: string; message: string }): never {
  if (error.code === "23505") fail(path, "Ya existe un registro con ese nombre o código.");
  if (error.code === "23514") fail(path, "Un dato no es válido (revisa el RUT, que debe ser 12345678-5).");
  fail(path, error.message);
}

async function guard() {
  await requireRole("admin");
  return createClient();
}

/* ------------------------------ Empresas ------------------------------ */
export async function createCompany(f: FormData) {
  const sb = await guard();
  const name = str(f, "name");
  if (!name) fail("/admin/empresas", "Ingresa el nombre de la empresa.");
  const { error } = await sb.from("companies").insert({ name, rut: str(f, "rut") || null });
  if (error) dbFail("/admin/empresas", error);
  revalidatePath("/admin/empresas");
}

export async function updateCompany(f: FormData) {
  const sb = await guard();
  const { error } = await sb
    .from("companies")
    .update({ name: str(f, "name"), rut: str(f, "rut") || null, is_active: f.get("is_active") === "on" })
    .eq("id", str(f, "id"));
  if (error) dbFail("/admin/empresas", error);
  revalidatePath("/admin/empresas");
}

/* -------------------------------- Áreas -------------------------------- */
export async function createDepartment(f: FormData) {
  const sb = await guard();
  const name = str(f, "name");
  const code = str(f, "code").toUpperCase();
  if (!name || !code) fail("/admin/areas", "Ingresa nombre y código del área.");
  const { error } = await sb.from("departments").insert({
    name,
    code,
    monthly_budget: money(f, "monthly_budget") ?? 0,
    approval_threshold: money(f, "approval_threshold"),
  });
  if (error) dbFail("/admin/areas", error);
  revalidatePath("/admin/areas");
}

export async function updateDepartment(f: FormData) {
  const sb = await guard();
  const { error } = await sb
    .from("departments")
    .update({
      name: str(f, "name"),
      code: str(f, "code").toUpperCase(),
      monthly_budget: money(f, "monthly_budget") ?? 0,
      approval_threshold: money(f, "approval_threshold"),
      is_active: f.get("is_active") === "on",
    })
    .eq("id", str(f, "id"));
  if (error) dbFail("/admin/areas", error);
  revalidatePath("/admin/areas");
}

/* ------------------------ Categorías y comprobantes ------------------------ */
export async function createCategory(f: FormData) {
  const sb = await guard();
  const name = str(f, "name");
  if (!name) fail("/admin/categorias", "Ingresa el nombre de la categoría.");
  const { error } = await sb.from("categories").insert({ name });
  if (error) dbFail("/admin/categorias", error);
  revalidatePath("/admin/categorias");
}

export async function updateCategory(f: FormData) {
  const sb = await guard();
  const { error } = await sb
    .from("categories")
    .update({ name: str(f, "name"), is_active: f.get("is_active") === "on" })
    .eq("id", str(f, "id"));
  if (error) dbFail("/admin/categorias", error);
  revalidatePath("/admin/categorias");
}

export async function toggleReceiptType(f: FormData) {
  const sb = await guard();
  const { error } = await sb
    .from("receipt_types")
    .update({ is_active: f.get("is_active") === "on" })
    .eq("id", str(f, "id"));
  if (error) dbFail("/admin/comprobantes", error);
  revalidatePath("/admin/comprobantes");
}

/* ------------------------------- Usuarios ------------------------------- */
const ROLES = ["employee", "manager", "admin", "general_manager"];

export async function createUser(f: FormData) {
  await requireRole("admin");
  const email = str(f, "email").toLowerCase();
  const full_name = str(f, "full_name");
  const password = str(f, "password");
  const role = str(f, "role");
  if (!email || !full_name) fail("/admin/usuarios", "Ingresa nombre y correo.");
  if (password.length < 8) fail("/admin/usuarios", "La contraseña temporal debe tener al menos 8 caracteres.");
  if (!ROLES.includes(role)) fail("/admin/usuarios", "Rol no válido.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data.user) {
    fail("/admin/usuarios", error?.message.includes("already") ? "Ese correo ya está registrado." : (error?.message ?? "No se pudo crear el usuario."));
  }

  // El trigger ya creó el perfil como 'employee'; aquí se completan los datos
  const sb = await createClient();
  const { error: e2 } = await sb
    .from("profiles")
    .update({ role, phone: str(f, "phone") || null, full_name })
    .eq("id", data.user.id);
  if (e2) dbFail("/admin/usuarios", e2);
  revalidatePath("/admin/usuarios");
}

export async function updateUser(f: FormData) {
  await requireRole("admin");
  const id = str(f, "id");
  const email = str(f, "email").toLowerCase();
  const password = str(f, "password");
  const supervisor = str(f, "supervisor_id");
  if (supervisor && supervisor === id) fail("/admin/usuarios", "Un usuario no puede ser su propio supervisor.");
  if (!email) fail("/admin/usuarios", "El correo no puede estar vacío.");

  const admin = createAdminClient();

  // Si se cambió el correo o se ingresó nueva contraseña, actualizar en Auth
  const authUpdates: { email?: string; password?: string; email_confirm?: boolean } = {};
  if (password && password.length >= 8) {
    authUpdates.password = password;
  } else if (password && password.length < 8) {
    fail("/admin/usuarios", "La nueva contraseña debe tener al menos 8 caracteres.");
  }
  authUpdates.email = email;
  authUpdates.email_confirm = true;

  const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdates);
  if (authError) {
    fail("/admin/usuarios", authError.message.includes("already") ? "Ese correo ya está en uso." : authError.message);
  }

  const sb = await createClient();
  const { error } = await sb
    .from("profiles")
    .update({
      email,
      full_name: str(f, "full_name"),
      phone: str(f, "phone") || null,
      role: str(f, "role"),
      department_id: str(f, "department_id") || null,
      supervisor_id: supervisor || null,
      is_active: f.get("is_active") === "on",
    })
    .eq("id", id);
  if (error) dbFail("/admin/usuarios", error);

  // Empresas a cuyo nombre puede comprar
  const companies = f.getAll("company_ids").map(String);
  await sb.from("user_companies").delete().eq("user_id", id);
  if (companies.length) {
    const { error: e2 } = await sb.from("user_companies").insert(companies.map((company_id) => ({ user_id: id, company_id })));
    if (e2) dbFail("/admin/usuarios", e2);
  }
  revalidatePath("/admin/usuarios");
}
