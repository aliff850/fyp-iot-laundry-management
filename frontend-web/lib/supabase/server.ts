import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";

export async function createClient(writable = false) {
  const config = getAuthConfig();
  if (!config || !getSiteUrl()) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { sameSite: "lax", secure: getSiteUrl()?.startsWith("https:") ?? false },
    cookies: {
      getAll: () => store.getAll(),
      // Server Components cannot write cookies; Proxy refreshes before rendering.
      setAll: writable ? (values) => { for (const { name, value, options } of values) store.set(name, value, options); } : undefined,
    },
  });
}
