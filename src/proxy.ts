import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo excepto archivos estáticos, íconos y manifest (necesarios sin sesión para la PWA)
    "/((?!_next/static|_next/image|manifest.json|icon.png|apple-icon.png|icons/|brand/|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
