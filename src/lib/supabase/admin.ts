import { createClient } from "@supabase/supabase-js";

/** Cliente con la clave secreta. SOLO para Server Actions / Route Handlers; nunca importar en componentes cliente. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
