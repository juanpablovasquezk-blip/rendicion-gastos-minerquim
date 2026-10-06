import { createClient } from "@/lib/supabase/server";

/** Genera una URL firmada de 1 hora para visualizar un comprobante privado */
export async function getSignedFileUrl(bucket: "receipts" | "deposits", path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const sb = await createClient();
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
