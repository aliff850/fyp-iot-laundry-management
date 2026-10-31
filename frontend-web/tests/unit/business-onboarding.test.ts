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

  it("coalesces concurrent in-flight token verification calls across parallel business requests", async () => {
    const getUserSpy = vi.fn().mockResolvedValue({
      data: { user: { email_confirmed_at: "2026-10-27" } },
      error: null,
    });
    const getSessionSpy = vi.fn().mockResolvedValue({
      data: { session: { access_token: "coalesced-token" } },
      error: null,
    });
    createClient.mockResolvedValue({
      auth: {
        getUser: getUserSpy,
        getSession: getSessionSpy,
      },
    });
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        Response.json({
          state: "active",
          role: "owner",
          organization: { id: "org-1", name: "Org 1" },
        })
      )
    );
    vi.stubGlobal("fetch", fetcher);

    const [res1, res2] = await Promise.all([
      businessRequest("/me"),
      businessRequest("/branches"),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(getUserSpy).toHaveBeenCalledTimes(1);
    expect(getSessionSpy).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("surfaces string error detail from backend 422 HTTPException responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Select an active owner, branch manager, or unassigned personnel in this organization" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })
    ));
    const result = await businessRequest("/branches", "POST", { name: "Test Branch" });
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      message: "Select an active owner, branch manager, or unassigned personnel in this organization",
    });
  });

  it("surfaces structured field-level validation errors from backend 422 Pydantic responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        detail: [
          { loc: ["body", "contact_phone"], msg: "String should match pattern '^[+()0-9 .-]+$'" },
        ],
      }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      })
    ));
    const result = await businessRequest("/branches", "POST", { name: "Test Branch" });
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      message: "contact_phone: String should match pattern '^[+()0-9 .-]+$'",
    });
  });

  it("surfaces backend 409 conflict detail rather than generic fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "A branch with this name already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    ));
    const result = await businessRequest("/branches", "POST", { name: "Duplicate Branch" });
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      message: "A branch with this name already exists",
    });
  });

  it("falls back to generic status code message when error body is not JSON or has no detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 503 })
    ));
    const result = await businessRequest("/branches", "POST");
    expect(result).toMatchObject({
      ok: false,
      status: 503,
      message: "Business setup is temporarily unavailable. Please retry.",
    });
  });
});
