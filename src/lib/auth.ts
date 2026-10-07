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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, credit_balance, phone")
    .eq("id", user.id)
    .single();
  return (data as Profile | null) ?? null;
});

/** Exige sesión y uno de los roles indicados; si no, redirige al inicio. */
export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (roles.length && !roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
