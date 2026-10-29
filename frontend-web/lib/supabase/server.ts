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
      // Server Components cannot write cookies; proxy refreshes sessions before rendering.
      // Providing setAll avoids 'originalSetAll is not a function' in @supabase/ssr.
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          // Cookie writes are not permitted in Next.js Server Components.
          // Ignored safely as proxy refreshes tokens before rendering.
        }
      },
    },
  });
}
