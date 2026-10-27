import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/auth/config";

export async function GET(request: NextRequest) {
  const site = getSiteUrl();
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!site) return new NextResponse("Email confirmation is temporarily unavailable. Please try again later.", { status: 503, headers });
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, site), 303);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  };
  const params = request.nextUrl.searchParams;
  const token = params.get("token_hash");
  const code = params.get("code");
  const validToken = token && params.get("type") === "email" && !code;
  const validCode = code && !token && !params.has("type");
  if (params.has("error") || (!validToken && !validCode) || (token?.length ?? 0) > 4096 || (code?.length ?? 0) > 4096) return finish("/check-email?confirmation=invalid");
  try {
    const client = await createClient(true);
    if (!client) return finish("/check-email?confirmation=unavailable");
    const { error } = validToken
      ? await client.auth.verifyOtp({ token_hash: token, type: "email" })
      : await client.auth.exchangeCodeForSession(code!);
    if (error) return finish(error.code === "otp_expired" ? "/check-email?confirmation=expired" : "/check-email?confirmation=invalid");
    // The confirmed product flow requires a fresh login after email confirmation.
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    return finish(signOutError ? "/check-email?confirmation=unavailable" : "/login?confirmed=1");
  } catch {
    return finish("/check-email?confirmation=unavailable");
  }
}
