import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getPublicOrganizations } from "@/lib/auth/organizations";

const createServerClient = vi.hoisted(() => vi.fn());
const mockCookiesStore = vi.hoisted(() => ({
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn().mockImplementation(() => {
    throw new Error("Cookies can only be modified in a Server Action or Route Handler");
  }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockImplementation(async () => mockCookiesStore) }));
import { proxy } from "@/proxy";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
});

describe("organization directory boundary", () => {
  it.each([404, 403, 500])("keeps HTTP %s distinct from an empty directory", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status })));
    expect(await getPublicOrganizations()).toEqual({ status: "unavailable", organizations: [] });
  });

  it("accepts a genuine empty response without inventing organizations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ organizations: [] })));
    expect(await getPublicOrganizations()).toEqual({ status: "ready", organizations: [] });
  });

  it("filters extra provider fields from valid entries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ organizations: [{ id: "org-a", name: "Laundry A", private_contact: "not-for-client" }] })));
    expect(await getPublicOrganizations()).toEqual({ status: "ready", organizations: [{ id: "org-a", name: "Laundry A" }] });
  });

  it("rejects malformed JSON contracts instead of coercing them into success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ organizations: [{ id: 12, name: "Laundry A" }] })));
    expect((await getPublicOrganizations()).status).toBe("unavailable");
  });
});

describe("session refresh and temporary operational gate", () => {
  it("preserves refreshed request/response cookies and cache headers", async () => {
    createServerClient.mockImplementation((_url, _key, options) => ({ auth: {
      getClaims: async () => {
        options.cookies.setAll([{ name: "test-session", value: "refreshed-session", options: { path: "/", sameSite: "lax" } }], { "Cache-Control": "private, no-store", Pragma: "no-cache" });
        return { data: { claims: { sub: "user-a" } }, error: null };
      },
    } }));
    const request = new NextRequest("http://localhost:3000/login");
    const response = await proxy(request);
    expect(request.cookies.get("test-session")?.value).toBe("refreshed-session");
    expect(response.cookies.get("test-session")?.value).toBe("refreshed-session");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("holds unmigrated dashboard routes before rendering or accepting any claimed role", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/dashboard?tab=analytics"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/membership-status?next=%2Fdashboard%3Ftab%3Danalytics");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("allows migrated branch routes to pass through to authorized server components", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/branches/branch-a"));
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("server component supabase client cookies", () => {
  it("provides setAll that safely catches Server Component cookie write attempts", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    let capturedOptions: any;
    createServerClient.mockImplementation((_url, _key, options) => {
      capturedOptions = options;
      return {};
    });

    const client = await createClient();
    expect(client).toBeDefined();
    expect(typeof capturedOptions?.cookies?.setAll).toBe("function");

    // setAll must not throw even if store.set throws (e.g. Server Component limitation)
    expect(() => {
      capturedOptions.cookies.setAll([{ name: "test", value: "val", options: {} }]);
    }).not.toThrow();
  });
});
