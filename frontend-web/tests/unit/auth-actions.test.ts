import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(), signUp: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), resend: vi.fn(),
  client: vi.fn(), directory: vi.fn(), membership: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/auth/organizations", () => ({ getPublicOrganizations: mocks.directory }));
vi.mock("@/lib/auth/business", () => ({ getMembership: mocks.membership }));
vi.mock("next/navigation", () => ({ redirect: (location: string) => { throw { location }; } }));

import { signIn, signUp, resendConfirmation, signOut } from "@/app/auth/actions";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ kind: "owner", name: "Aina Rahman", phone: "+60 12 345 6789", email: "aina@example.test", organizationName: "Aina Laundry", password: "Test-password-42", confirmPassword: "Test-password-42", ...overrides })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  mocks.client.mockResolvedValue({ auth: mocks });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a", email_confirmed_at: "2026-10-27T00:00:00Z" } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.directory.mockResolvedValue({ status: "unavailable", organizations: [] });
  mocks.membership.mockResolvedValue({ ok: true, value: { state: "active", role: "owner", organization: { id: "org-a", name: "Aina Laundry" } } });
});

describe("real identity provider boundary", () => {
  it("keeps missing project configuration unavailable without calling a provider", async () => {
    mocks.client.mockResolvedValue(null);
    expect((await signIn({}, form())).status).toBe("error");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not call Supabase for malformed credentials", async () => {
    const result = await signIn({}, form({ email: "admin" }));
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("keeps failed authentication on the form without a demo success", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: "invalid_credentials", message: "internal provider detail" } });
    const result = await signIn({}, form());
    expect(result.status).toBe("error");
    expect(result.message).toContain("email or password");
    expect(result.message).not.toContain("internal");
  });

  it("reports network failure without inventing a session", async () => {
    mocks.signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));
    expect((await signIn({}, form())).status).toBe("error");
  });

  it("sends a returning owner directly to Branches", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    await expect(signIn({}, form())).rejects.toEqual({ location: "/branches" });
  });

  it("automatically provisions an incomplete owner then opens Branches", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    mocks.membership.mockResolvedValueOnce({ ok: true, value: { state: "incomplete", role: null, organization: null } });
    await expect(signIn({}, form())).rejects.toEqual({ location: "/branches" });
    expect(mocks.membership).toHaveBeenNthCalledWith(1, "/me");
    expect(mocks.membership).toHaveBeenNthCalledWith(2, "/onboarding", "POST");
  });

  it("rechecks an uncertain onboarding write before redirecting an active owner", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    mocks.membership.mockResolvedValueOnce({ ok: true, value: { state: "incomplete", role: null, organization: null } });
    mocks.membership.mockResolvedValueOnce({ ok: false, status: 503, message: "This action may have completed." });
    await expect(signIn({}, form())).rejects.toEqual({ location: "/branches" });
    expect(mocks.membership).toHaveBeenNthCalledWith(3, "/me");
  });

  it("keeps pending personnel and unavailable business service on the status route", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    mocks.membership.mockResolvedValueOnce({ ok: true, value: { state: "pending", role: null, organization: { id: "org-a", name: "Aina Laundry" } } });
    await expect(signIn({}, form())).rejects.toEqual({ location: "/membership-status" });
    mocks.membership.mockResolvedValueOnce({ ok: false, status: 503, message: "Unavailable" });
    await expect(signIn({}, form())).rejects.toEqual({ location: "/membership-status" });
  });

  it("honors owner branch setup but avoids gated deep-link loops", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    await expect(signIn({}, form({ next: "/branches/new" }))).rejects.toEqual({ location: "/branches/new" });
    await expect(signIn({}, form({ next: "/dashboard" }))).rejects.toEqual({ location: "/branches" });
    await expect(signIn({}, form({ next: "/branches/branch-a" }))).rejects.toEqual({ location: "/branches" });
  });

  it("does not accept a provider session without a confirmed verified identity", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: {} }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-a", email_confirmed_at: null } }, error: null });
    expect((await signIn({}, form())).status).toBe("error");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("stores only untrusted owner intent and sends signup to check-email", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-a" }, session: null }, error: null });
    await expect(signUp({}, form())).rejects.toEqual({ location: "/check-email" });
    const args = mocks.signUp.mock.calls[0][0];
    expect(args.options.data.onboarding_intent).toEqual({ kind: "owner", organization_name: "Aina Laundry" });
    expect(args.options.data).not.toHaveProperty("role");
    expect(args.options).not.toHaveProperty("app_metadata");
    expect(args.options.emailRedirectTo).toBe("http://localhost:3000/auth/confirm");
  });

  it("refuses personnel signup while the real organization directory is unavailable", async () => {
    expect((await signUp({}, form({ kind: "personnel", organizationId: "forged" }))).status).toBe("error");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects an organization ID absent from a successful directory response", async () => {
    mocks.directory.mockResolvedValue({ status: "ready", organizations: [{ id: "org-a", name: "Laundry A" }] });
    expect((await signUp({}, form({ kind: "personnel", organizationId: "org-b" }))).status).toBe("error");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("does not preserve an auto-login session when confirmation is disabled remotely", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-a" }, session: {} }, error: null });
    expect((await signUp({}, form())).status).toBe("error");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("handles resend throttling and never reports a rejected send as delivered", async () => {
    mocks.resend.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } });
    expect((await resendConfirmation({}, form())).status).toBe("error");
  });

  it("does not pretend sign-out succeeded when the provider fails", async () => {
    mocks.signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    expect((await signOut()).status).toBe("error");
  });
});
