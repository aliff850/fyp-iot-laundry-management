type Environment = Record<string, string | undefined>;

function allowedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getAuthConfig(env: Environment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !allowedOrigin(url)) return null;
  return { url, key };
}

export function getSiteUrl(env: Environment = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
}): string | null {
  const value = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return env.NODE_ENV === "development" ? "http://localhost:3000" : null;
  const origin = allowedOrigin(value);
  if (!origin || ![origin, `${origin}/`].includes(value)) return null;
  return origin;
}
