import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetNotifications = vi.hoisted(() => vi.fn());
const mockGetRemoteMachines = vi.hoisted(() => vi.fn());
const mockGetBranchLpgSafety = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/business", () => ({
  getNotifications: mockGetNotifications,
  getRemoteMachines: mockGetRemoteMachines,
  getBranchLpgSafety: mockGetBranchLpgSafety,
}));

import { GET as getNotificationsRoute } from "@/app/api/workspace/notifications/route";
import { GET as getMachinesRoute } from "@/app/api/workspace/branches/[branchId]/machines/route";
import { GET as getLpgSafetyRoute } from "@/app/api/workspace/branches/[branchId]/lpg-safety/route";

const VALID_BRANCH = "11111111-1111-1111-1111-111111111111";

describe("Workspace polling GET Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates notifications branchId and forwards private no-store data", async () => {
    const badReq = new NextRequest(
      "http://localhost:3000/api/workspace/notifications?branchId=not-a-uuid",
    );
    const badRes = await getNotificationsRoute(badReq);
    expect(badRes.status).toBe(400);
    expect(badRes.headers.get("cache-control")).toContain("no-store");
    expect(mockGetNotifications).not.toHaveBeenCalled();

    mockGetNotifications.mockResolvedValue({
      ok: true,
      value: { checked_at: "2026-11-25T00:00:00Z", events: [], devices: [], branches: [] },
    });
    const okReq = new NextRequest(
      `http://localhost:3000/api/workspace/notifications?category=lpg&branchId=${VALID_BRANCH}&limit=50`,
    );
    const okRes = await getNotificationsRoute(okReq);
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("cache-control")).toContain("no-store");
    expect(mockGetNotifications).toHaveBeenCalledWith({
      category: "lpg",
      branchId: VALID_BRANCH,
      limit: 50,
    });
    expect(await okRes.json()).toMatchObject({ ok: true, data: { events: [] } });
  });

  it("rejects malformed branch identifiers on machine and LPG polling routes", async () => {
    const mBad = await getMachinesRoute(new Request("http://localhost:3000"), {
      params: Promise.resolve({ branchId: "bad-id" }),
    });
    expect(mBad.status).toBe(400);
    expect(mockGetRemoteMachines).not.toHaveBeenCalled();

    const lBad = await getLpgSafetyRoute(new Request("http://localhost:3000"), {
      params: Promise.resolve({ branchId: "bad-id" }),
    });
    expect(lBad.status).toBe(400);
    expect(mockGetBranchLpgSafety).not.toHaveBeenCalled();
  });

  it("forwards machine and LPG snapshots and preserves upstream auth errors", async () => {
    mockGetRemoteMachines.mockResolvedValue({ ok: true, value: [{ source_id: "w-1" }] });
    const mOk = await getMachinesRoute(new Request("http://localhost:3000"), {
      params: Promise.resolve({ branchId: VALID_BRANCH }),
    });
    expect(mOk.status).toBe(200);
    expect(mOk.headers.get("cache-control")).toContain("no-store");
    expect(await mOk.json()).toEqual({ ok: true, value: [{ source_id: "w-1" }] });

    mockGetBranchLpgSafety.mockResolvedValue({
      ok: false,
      status: 403,
      message: "Access denied",
    });
    const lErr = await getLpgSafetyRoute(new Request("http://localhost:3000"), {
      params: Promise.resolve({ branchId: VALID_BRANCH }),
    });
    expect(lErr.status).toBe(403);
    expect(await lErr.json()).toEqual({ ok: false, status: 403, message: "Access denied" });
  });
});
