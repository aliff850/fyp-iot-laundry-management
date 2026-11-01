import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requestPairingCodeAction,
  confirmGatewayAction,
  approveDeviceAction,
  retireDeviceAction,
  pollClaimStatusAction,
} from "@/app/branches/[branchId]/hardware-setup/actions";
import { businessRequest } from "@/lib/auth/business";

vi.mock("@/lib/auth/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/business")>();
  return {
    ...actual,
    businessRequest: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Hardware Setup Server Actions", () => {
  const branchId = "branch-111";
  const mockRequest = vi.mocked(businessRequest);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requestPairingCodeAction issues a 12-char code and returns claim_id", async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      value: {
        claim_id: "claim-123",
        code: "ABCD-EFGH-JKLM",
        expires_at: "2026-11-01T12:30:00Z",
        branch_id: branchId,
      } as never,
    });

    const res = await requestPairingCodeAction(branchId);
    expect(res.success).toBe(true);
    expect(res.code).toBe("ABCD-EFGH-JKLM");
    expect(res.claim_id).toBe("claim-123");
  });

  it("confirmGatewayAction confirms gateway activation", async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      value: {
        message: "Gateway activated.",
        gateway_id: "gw-999",
      } as never,
    });

    const res = await confirmGatewayAction(branchId, "claim-123", "gw-999");
    expect(res.success).toBe(true);
    expect(res.message).toBe("Gateway activated.");
  });

  it("approveDeviceAction approves discovery candidate", async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      value: {
        message: "Device approved.",
      } as never,
    });

    const res = await approveDeviceAction(branchId, "cand-555", {
      device_type: "washer",
      label: "Washer #01",
      source_kind: "physical",
      capacity_kg: 15,
    });

    expect(res.success).toBe(true);
    expect(res.message).toBe("Device approved.");
  });

  it("retireDeviceAction retires active device", async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      value: {
        message: "Device retired.",
      } as never,
    });

    const res = await retireDeviceAction(branchId, "dev-123");
    expect(res.success).toBe(true);
    expect(res.message).toBe("Device retired.");
  });

  it("pollClaimStatusAction fetches current claim status", async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      value: {
        claim_id: "claim-123",
        status: "redeemed_pending",
        verification_fingerprint: "SPIN-8A2F",
        expires_at: "2026-11-01T12:30:00Z",
        confirmation_expires_at: "2026-11-01T12:40:00Z",
        gateway_id: "gw-999",
      } as never,
    });

    const claim = await pollClaimStatusAction(branchId, "claim-123");
    expect(claim?.verification_fingerprint).toBe("SPIN-8A2F");
    expect(claim?.status).toBe("redeemed_pending");
  });
});

