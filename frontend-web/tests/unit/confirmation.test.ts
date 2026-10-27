import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn(), signOut: vi.fn() }));
const client = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
import { GET } from "@/app/auth/confirm/route";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  client.mockResolvedValue({ auth });
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe("confirmation callback", () => {
  it("consumes an email token, clears the callback session and returns to login", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/auth/confirm?token_hash=test-token&type=email&next=https://outside.example.test"));
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "test-token", type: "email" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?confirmed=1");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("supports the default PKCE email redirect when a verifier is available", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/auth/confirm?code=one-time-code"));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?confirmed=1");
  });

  it.each(["?token_hash=test-token&type=recovery", "?next=//outside.example.test", "?code=x&token_hash=y&type=email"])("rejects malformed or unrelated callbacks %s", async (query) => {
    const response = await GET(new NextRequest(`http://localhost:3000/auth/confirm${query}`));
    expect(response.headers.get("location")).toBe("http://localhost:3000/check-email?confirmation=invalid");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("shows an expired state without putting the consumed token into a return URL", async () => {
    auth.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const response = await GET(new NextRequest("http://localhost:3000/auth/confirm?token_hash=test-token&type=email"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/check-email?confirmation=expired");
  });

  it("does not report confirmation success if clearing the callback session fails", async () => {
    auth.signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    const response = await GET(new NextRequest("http://localhost:3000/auth/confirm?code=one-time-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/check-email?confirmation=unavailable");
  });
});
