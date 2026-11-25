import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ActionToast } from "@/components/workspace/common/ActionToast";
import {
  ActionToastProvider,
  defaultDurationForKind,
  MAX_ACTION_TOASTS,
  upsertActionToast,
  withActionToast,
  type ActionToastEntry,
} from "@/components/workspace/common/ActionToastContext";
import { ServiceAndIncidentModal } from "@/components/workspace/common/ServiceAndIncidentModal";

describe("Bottom-left floating ActionToast system", () => {
  it("renders floating ActionToast on bottom-left with info/success/error tokens, optional link, and 44px dismiss control", () => {
    const infoHtml = renderToString(
      React.createElement(ActionToast, {
        kind: "info",
        title: "Sending maintenance command",
        message: "Dispatching start_maintenance to Pi 5 gateway…",
        onDismiss: () => {},
      }),
    );
    expect(infoHtml).toContain("bottom-20 left-4");
    expect(infoHtml).toContain("md:bottom-5 md:left-5");
    expect(infoHtml).toContain("border-l-4 border-l-warning");
    expect(infoHtml).toContain('role="status"');
    expect(infoHtml).toContain("size-11 min-h-11 min-w-11");

    const successHtml = renderToString(
      React.createElement(ActionToast, {
        kind: "success",
        title: "Service log saved",
        message: "Washer returned to customer service.",
        actionHref: "/branches/b-1/machines/maintenance",
        actionLabel: "View maintenance log",
        timestamp: 1763900000000,
        onDismiss: () => {},
      }),
    );
    expect(successHtml).toContain("border-positive");
    expect(successHtml).toContain('href="/branches/b-1/machines/maintenance"');
    expect(successHtml).toContain("View maintenance log");

    const errorHtml = renderToString(
      React.createElement(ActionToast, {
        kind: "error",
        title: "Command timed out",
        message: "Pi 5 gateway did not acknowledge within 15s.",
        onDismiss: () => {},
      }),
    );
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain("border-negative");
  });

  it("renders ActionToastProvider top-layer popover anchored bottom-left", () => {
    const html = renderToString(
      React.createElement(
        ActionToastProvider,
        null,
        React.createElement("main", null, "Workspace content"),
      ),
    );
    expect(html).toContain('popover="manual"');
    expect(html).toContain('aria-label="Action notifications"');
    expect(html).toContain("inset-auto bottom-20 left-4 right-auto top-auto z-[100]");
    expect(html).toContain("md:bottom-5 md:left-5");
    expect(html).toContain("Workspace content");
  });

  it("deduplicates matching toast IDs in place and caps visible toasts at MAX_ACTION_TOASTS", () => {
    const t1: ActionToastEntry = {
      id: "machine-cmd-washer-sim-01",
      kind: "info",
      title: "Sending command",
      message: "Putting Demo Washer 01 under maintenance…",
      timestamp: 1000,
    };
    const t2: ActionToastEntry = {
      id: "other-toast",
      kind: "success",
      title: "Saved",
      message: "Branch details saved.",
      timestamp: 1100,
    };
    const t1Updated: ActionToastEntry = {
      id: "machine-cmd-washer-sim-01",
      kind: "success",
      title: "Completed",
      message: "Demo Washer 01 is now in maintenance.",
      timestamp: 1200,
    };

    const step1 = upsertActionToast([], t1);
    const step2 = upsertActionToast(step1, t2);
    const step3 = upsertActionToast(step2, t1Updated);
    expect(step3).toHaveLength(2);
    expect(step3[0]).toMatchObject({ id: "machine-cmd-washer-sim-01", kind: "success" });

    const capped = [1, 2, 3, 4].reduce<ActionToastEntry[]>(
      (acc, n) =>
        upsertActionToast(acc, {
          id: `toast-${n}`,
          kind: "success",
          title: `Toast ${n}`,
          message: `Msg ${n}`,
          timestamp: n * 100,
        }),
      [],
    );
    expect(capped).toHaveLength(MAX_ACTION_TOASTS);
    expect(capped.map((t) => t.id)).toEqual(["toast-2", "toast-3", "toast-4"]);
  });

  it("uses sticky duration for info toasts and auto-dismiss durations for success/error", () => {
    expect(defaultDurationForKind("info")).toBeNull();
    expect(defaultDurationForKind("success")).toBe(6000);
    expect(defaultDurationForKind("error")).toBe(10000);
  });

  it("wraps Server Actions with withActionToast to emit success and error toasts cleanly", async () => {
    type DemoActionState = { success?: boolean; message?: string };
    const notify = vi.fn();
    const okAction = withActionToast<DemoActionState>(
      notify,
      async () => ({ success: true, message: "Account profile updated." }),
      { id: "acct-profile", successTitle: "Profile saved", errorTitle: "Profile save failed" },
    );
    const okState = await okAction({}, new FormData());
    expect(okState.success).toBe(true);
    expect(notify).toHaveBeenCalledWith({
      id: "acct-profile",
      kind: "success",
      title: "Profile saved",
      message: "Account profile updated.",
    });

    const failAction = withActionToast<DemoActionState>(
      notify,
      async () => ({ success: false, message: "Invalid phone number." }),
      { id: "acct-profile", successTitle: "Profile saved", errorTitle: "Profile save failed" },
    );
    const failState = await failAction({}, new FormData());
    expect(failState.success).toBe(false);
    expect(notify).toHaveBeenLastCalledWith({
      id: "acct-profile",
      kind: "error",
      title: "Profile save failed",
      message: "Invalid phone number.",
    });
  });

  it("renders ServiceAndIncidentModal safely without inline feedback banners", () => {
    const idleHtml = renderToString(
      React.createElement(ServiceAndIncidentModal, {
        open: false,
        branchId: "branch-1",
        domain: "machine",
        sourceId: "washer-sim-01",
        assetLabel: "Demo Washer 01",
        assetStatus: "IDLE",
        isMaintenanceMode: false,
        branchOpen: true,
        defaultTechnicianName: "Ali Tech",
        onClose: () => {},
      }),
    );
    expect(idleHtml).toBe("");

    const maintHtml = renderToString(
      React.createElement(ServiceAndIncidentModal, {
        open: true,
        branchId: "branch-1",
        domain: "lpg",
        sourceId: "esp32-lpg-01",
        assetLabel: "Main Cylinder",
        assetStatus: "LOW",
        isMaintenanceMode: true,
        defaultTechnicianName: "Ali Tech",
        onClose: () => {},
      }),
    );
    expect(maintHtml).toContain("Maintenance Active");
    expect(maintHtml).toContain("Complete service &amp; return online");
    expect(maintHtml).not.toContain('role="status"');
    expect(maintHtml).not.toContain('role="alert"');
  });
});
