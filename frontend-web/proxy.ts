import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";
import { workspaceDestination } from "@/lib/auth/redirects";

export async function proxy(request: NextRequest) {
  // Unmigrated prototype routes remain held at workspaceDestination until migrated.
  if (/^\/dashboard(\/|$)/.test(request.nextUrl.pathname)) {
    const response = NextResponse.redirect(new URL(workspaceDestination(request.nextUrl.pathname + request.nextUrl.search), request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  const config = getAuthConfig();
  if (!config || !getSiteUrl()) return response;
  const client = createServerClient(config.url, config.key, {
    cookieOptions: { sameSite: "lax", secure: getSiteUrl()?.startsWith("https:") ?? false },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      },
    },
  });
  try {
    await client.auth.getClaims();
  } catch {
    // A provider outage never grants access; protected pages verify identity again.
  }
  return response;
}

export const config = {
  matcher: ["/login", "/register/:path*", "/check-email", "/auth/:path*", "/membership-status", "/personnel/:path*", "/branches/:path*", "/dashboard/:path*"],
};
