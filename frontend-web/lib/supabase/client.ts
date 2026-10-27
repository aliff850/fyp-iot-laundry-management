import { createBrowserClient } from "@supabase/ssr";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";

export function createClient() {
  const config = getAuthConfig();
  if (!config || !getSiteUrl()) return null;
  return createBrowserClient(config.url, config.key, {
    cookieOptions: { sameSite: "lax", secure: getSiteUrl()?.startsWith("https:") ?? false },
  });
}
