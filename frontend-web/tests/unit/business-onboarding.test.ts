import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient }));
import { businessRequest, getJoinRequests, getMembership } from "@/lib/auth/business";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8000");
  createClient.mockResolvedValue({ auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { email_confirmed_at: "2026-10-27" } }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "verified-user-token" } }, error: null }),
  } });
});

describe("FastAPI onboarding boundary", () => {
  it("sends the session only from the server to the configured business API", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ state: "pending", organization: null, role: null }));
    vi.stubGlobal("fetch", fetcher);
    const result = await businessRequest("/onboarding", "POST");
    expect(result).toMatchObject({ ok: true, value: { state: "pending" } });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8000/onboarding", expect.objectContaining({
      method: "POST", cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer verified-user-token" }),
    }));
  });

  it("never calls FastAPI with an unconfirmed user", async () => {
    createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { email_confirmed_at: null } }, error: null }) } });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await businessRequest("/me")).toMatchObject({ ok: false, status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps unavailable configuration and forbidden responses distinct", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(await businessRequest("/me")).toMatchObject({ ok: false, status: 503 });
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8000");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    expect(await businessRequest("/join-requests")).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects malformed success envelopes instead of claiming a role or empty queue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ state: "active", role: "owner" })));
    expect(await getMembership()).toMatchObject({ ok: false, status: 503 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ requests: "missing" })));
    expect(await getJoinRequests()).toMatchObject({ ok: false, status: 503 });
  });

  it("treats a failed mutation response as uncertain rather than claiming it did not commit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection closed")));
    const result = await businessRequest("/onboarding", "POST");
    expect(result).toMatchObject({ ok: false, status: 503 });
    if (!result.ok) expect(result.message).toContain("may have completed");
  });

  it("accepts approved_unassigned state with null operational role", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      state: "approved_unassigned",
      role: null,
      organization: { id: "00000000-0000-0000-0000-000000000001", name: "Test Org" },
    })));
    const result = await getMembership("/me");
    expect(result).toMatchObject({
      ok: true,
      value: {
        state: "approved_unassigned",
        role: null,
        organization: { id: "00000000-0000-0000-0000-000000000001", name: "Test Org" },
      },
    });
  });
});
