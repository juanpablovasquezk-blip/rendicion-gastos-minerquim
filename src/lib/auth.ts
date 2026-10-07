import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";

export { ROLE_LABELS };
export type { UserRole };

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  credit_balance?: number;
  phone?: string | null;
};

/** Perfil del usuario autenticado (una consulta por request). */
export const getProfile = cache(async (): Promise<Profile | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) return null;

    // Intentar obtener perfil completo
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      console.warn("[getProfile] Error al consultar perfil completo, intentando campos básicos:", error?.message);
      // Fallback a campos esenciales para no bloquear la sesión
      const { data: fallbackData } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active")
        .eq("id", user.id)
        .single();

      if (fallbackData) {
        return {
          id: fallbackData.id,
          full_name: fallbackData.full_name,
          email: fallbackData.email,
          role: fallbackData.role,
          is_active: fallbackData.is_active,
          credit_balance: 0,
          phone: null,
        };
      }
      return null;
    }

    return {
      id: data.id,
      full_name: data.full_name,
      email: data.email,
      role: data.role,
      is_active: data.is_active,
      credit_balance: Number(data.credit_balance || 0),
      phone: data.phone || null,
    };
  } catch (err: any) {
    if (
      err?.digest === "DYNAMIC_SERVER_USAGE" ||
      err?.message?.includes("DYNAMIC_SERVER_USAGE") ||
      err?.message?.includes("Dynamic server usage")
    ) {
      throw err;
    }
    console.error("[getProfile] Error al recuperar sesión:", err?.message || err);
    return null;
  }
});

/** Exige sesión y uno de los roles indicados; si no, redirige al inicio. */
export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (roles.length && !roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
