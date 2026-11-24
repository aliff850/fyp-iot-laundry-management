import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchLocationPicker } from "@/components/workspace/branches/BranchLocationPicker";
import { lookupBranchAddressAction } from "@/app/branches/actions";
import { geocodeBranchAddress } from "@/lib/auth/business";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}));

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalFetch = global.fetch;

describe("BranchLocationPicker component", () => {
  it("hides owner address search controls by default (non-owner / manual-only)", () => {
    const raw = renderToString(
      React.createElement(BranchLocationPicker, {
        latitude: "",
        longitude: "",
        onChange: () => {},
      }),
    );

    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Click on map or drag pin to position branch location");
    expect(raw).not.toContain('id="branch-address-search"');
    expect(raw).not.toContain("·");
  });

  it("renders Photon map-pin search controls and 44px touch targets when enabled", () => {
    const raw = renderToString(
      React.createElement(BranchLocationPicker, {
        latitude: "3.073800",
        longitude: "101.518300",
        onChange: () => {},
        allowAddressSearch: true,
        addressContext: "Jalan Universiti 1, Shah Alam, Selangor",
      }),
    );

    const text = raw.replace(/<!--.*?-->/g, "");
    expect(raw).toContain('id="branch-address-search"');
    expect(text).toContain("Use branch address");
    expect(text).toContain("Search");
    expect(text).toContain("Clear pin");
    expect(text).toContain("3.073800, 101.518300");

    expect(raw).toMatch(/<input[^>]*id="branch-address-search"[^>]*min-h-11/);
    expect(raw).toMatch(/<button[^>]*min-h-11[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Search<\/span>/);
    expect(raw).toMatch(/<button[^>]*min-h-11[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Clear pin<\/span>/);
    expect(raw).not.toContain("·");
  });
});

describe("lookupBranchAddressAction & geocodeBranchAddress validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u-owner", email_confirmed_at: "2026-01-01T00:00:00Z" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "verified-jwt-token" } },
      error: null,
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    global.fetch = originalFetch;
  });

  it("rejects short queries and email identifiers before calling FastAPI", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const shortRes = await lookupBranchAddressAction("ab");
    expect(shortRes.ok).toBe(false);
    expect(shortRes.status).toBe(422);

    const emailRes = await lookupBranchAddressAction("owner@example.com");
    expect(emailRes.ok).toBe(false);
    expect(emailRes.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls /maps/geocode with Photon payload and returns coordinates for map pin placement", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          query: "Shah Alam Seksyen 13",
          cached: false,
          provider: "photon",
          attribution: "Address suggestions (c) OpenStreetMap contributors via Photon",
          results: [
            {
              display_name: "Jalan Universiti, 40100 Shah Alam, Selangor",
              latitude: 3.0738,
              longitude: 101.5183,
              address_line: "Jalan Universiti",
              city: "Shah Alam",
              region: "Selangor",
              postal_code: "40100",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    const res = await lookupBranchAddressAction("  Shah Alam  Seksyen 13 ");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/maps/geocode?q=Shah+Alam+Seksyen+13&limit=5",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer verified-jwt-token" }),
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.results?.[0].latitude).toBe(3.0738);
    expect(res.results?.[0].longitude).toBe(101.5183);
    expect(res.attribution).toContain("Photon");
  });

  it("surfaces backend 429 throttle message cleanly", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ detail: "Address suggestions are momentarily rate-limited." }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const res = await lookupBranchAddressAction("Penang Sentral");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.message).toContain("rate-limited");
  });

  it("rejects out-of-range coordinates returned by upstream", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          query: "Bad Coords",
          cached: false,
          provider: "photon",
          attribution: "OSM",
          results: [{ display_name: "Bad", latitude: 120, longitude: 101 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    const res = await geocodeBranchAddress("Bad Coords");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(503);
    }
  });
});
