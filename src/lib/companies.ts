import { SupabaseClient } from "@supabase/supabase-js";
import { UserRole } from "./roles";

export type CompanyOption = {
  id: string;
  name: string;
  is_active: boolean;
};

/**
 * Obtiene las empresas disponibles para un usuario:
 * - Administradores y Gerencia General tienen acceso a todas las empresas activas.
 * - Colaboradores tienen acceso a las empresas asignadas en user_companies (o a todas si aún no se le restringe).
 */
export async function getUserAuthorizedCompanies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  role: UserRole
): Promise<CompanyOption[]> {
  // 1. Si es admin o general_manager, ve todas las empresas activas directamente
  if (role === "admin" || role === "general_manager") {
    const { data: allActive } = await supabase
      .from("companies")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name");
    return allActive ?? [];
  }

  // 2. Para otros roles, consultar empresas asignadas
  const { data: userCompanies } = await supabase
    .from("user_companies")
    .select("company_id, companies(id, name, is_active)")
    .eq("user_id", userId);

  const assigned = (userCompanies ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((uc: any) => uc.companies)
    .filter((c: CompanyOption | null) => c && c.is_active);

  if (assigned.length > 0) {
    return assigned;
  }

  // Si no tiene empresas restringidas de forma explícita, habilitar todas las activas
  const { data: fallbackActive } = await supabase
    .from("companies")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name");

  return fallbackActive ?? [];
}
