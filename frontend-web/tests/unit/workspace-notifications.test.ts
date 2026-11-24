import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import {
  describePushStatus,
  PushNotificationToggle,
} from "@/components/workspace/notifications/PushNotificationToggle";
import {
  detectPushSupport,
  isIosDevice,
  urlBase64ToUint8Array,
} from "@/components/workspace/notifications/pushClient";
import React from "react";
import { renderToString } from "react-dom/server";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import {
  computeUnreadNotifications,
  detectNotificationTransitions,
  mergeNotificationEvents,
  notificationHref,
  notificationVisuals,
} from "@/components/workspace/notifications/notificationLogic";
import type {
  NotificationDeviceSummary,
  WorkspaceNotificationEvent,
} from "@/lib/auth/business";

const BRANCH_A = "44444444-4444-4444-4444-444444444444";
const BRANCH_B = "55555555-5555-5555-5555-555555555555";

function makeDevice(
  overrides: Partial<NotificationDeviceSummary>,
): NotificationDeviceSummary {
  return {
    branch_id: BRANCH_A,
    branch_name: "MSU Shah Alam",
    source_id: "washer-01",
    label: "Washer 01",
    type: "washer",
    status: "active",
    maintenance_mode: false,
    freshness: "fresh",
    state: "IDLE",
    fault_code: null,
    program_id: null,
    lpg_percent: null,
    ppm_calibrated: false,
    gas_condition: null,
    estimated_ppm: null,
    sample_at: "2026-11-16T01:00:00Z",
    ...overrides,
  };
}

describe("notificationLogic multi-branch transitions and merging", () => {
  it("seeds initial snapshots without alerts and tracks identical source_id across branches independently", () => {
    const firstDevices = [
      makeDevice({ branch_id: BRANCH_A, branch_name: "MSU Shah Alam", source_id: "washer-01", state: "IDLE" }),
      makeDevice({ branch_id: BRANCH_B, branch_name: "Subang Jaya", source_id: "washer-01", state: "IDLE" }),
    ];

    const seedResult = detectNotificationTransitions(null, firstDevices, "2026-11-16T01:00:00Z");
    expect(seedResult.triggeredEvents).toHaveLength(0);
    expect(Object.keys(seedResult.nextMap)).toContain(`${BRANCH_A}:washer-01`);
    expect(Object.keys(seedResult.nextMap)).toContain(`${BRANCH_B}:washer-01`);

    const secondDevices = [
      makeDevice({
        branch_id: BRANCH_A,
        branch_name: "MSU Shah Alam",
        source_id: "washer-01",
        state: "ERROR",
        fault_code: "E12",
        sample_at: "2026-11-16T01:00:10Z",
      }),
      makeDevice({
        branch_id: BRANCH_B,
        branch_name: "Subang Jaya",
        source_id: "washer-01",
        state: "RUNNING",
        program_id: "quick",
        sample_at: "2026-11-16T01:00:10Z",
      }),
    ];

    const nextResult = detectNotificationTransitions(
      seedResult.nextMap,
      secondDevices,
      "2026-11-16T01:00:10Z",
    );
    expect(nextResult.triggeredEvents).toHaveLength(2);

    const faultEvent = nextResult.triggeredEvents.find((e) => e.kind === "machine_fault");
    const runEvent = nextResult.triggeredEvents.find((e) => e.kind === "machine_running");
    expect(faultEvent?.branch_id).toBe(BRANCH_A);
    expect(faultEvent?.branch_name).toBe("MSU Shah Alam");
    expect(faultEvent?.detail).toContain("E12");
    expect(runEvent?.branch_id).toBe(BRANCH_B);
    expect(runEvent?.branch_name).toBe("Subang Jaya");
    expect(runEvent?.detail).toContain("Quick");
  });

  it("detects LPG low/critical and calibrated gas conditions with branch context", () => {
    const lpgStart = [
      makeDevice({
        branch_id: BRANCH_B,
        branch_name: "Subang Jaya",
        source_id: "esp32-lpg-01",
        label: "Cylinder Bank 1",
        type: "lpg_edge_node",
        lpg_percent: 45,
        ppm_calibrated: true,
        gas_condition: "normal",
        estimated_ppm: 120,
      }),
    ];
    const seeded = detectNotificationTransitions(null, lpgStart, "2026-11-16T01:00:00Z");

    const lpgAlert = [
      makeDevice({
        branch_id: BRANCH_B,
        branch_name: "Subang Jaya",
        source_id: "esp32-lpg-01",
        label: "Cylinder Bank 1",
        type: "lpg_edge_node",
        lpg_percent: 3.2,
        ppm_calibrated: true,
        gas_condition: "critical",
        estimated_ppm: 1950,
        sample_at: "2026-11-16T01:00:15Z",
      }),
    ];
    const next = detectNotificationTransitions(seeded.nextMap, lpgAlert, "2026-11-16T01:00:15Z");
    expect(next.triggeredEvents.map((e) => e.kind).sort()).toEqual([
      "lpg_critical",
      "lpg_gas_critical",
    ]);
    expect(next.triggeredEvents.every((e) => e.branch_name === "Subang Jaya")).toBe(true);
  });

  it("deduplicates live events covered by local transitions only within matching branch and device", () => {
    const txEvent: WorkspaceNotificationEvent = {
      id: `tx:${BRANCH_A}:machine:washer-01:running:2026-11-16T01:00:05Z`,
      branch_id: BRANCH_A,
      branch_name: "MSU Shah Alam",
      category: "machine",
      kind: "machine_running",
      severity: "info",
      title: "Machine running",
      detail: "Washer 01 started Quick",
      source_id: "washer-01",
      device_label: "Washer 01",
      occurred_at: "2026-11-16T01:00:05Z",
      active: true,
    };
    const sameBranchLive: WorkspaceNotificationEvent = {
      ...txEvent,
      id: `live:${BRANCH_A}:machine:washer-01:running`,
      occurred_at: "2026-11-16T01:00:10Z",
    };
    const otherBranchLive: WorkspaceNotificationEvent = {
      ...txEvent,
      id: `live:${BRANCH_B}:machine:washer-01:running`,
      branch_id: BRANCH_B,
      branch_name: "Subang Jaya",
      occurred_at: "2026-11-16T01:00:10Z",
    };

    const merged = mergeNotificationEvents([sameBranchLive, otherBranchLive], [txEvent]);
    expect(merged.map((m) => m.id)).toEqual([otherBranchLive.id, txEvent.id]);
    expect(notificationHref(otherBranchLive)).toBe(`/branches/${BRANCH_B}/machines`);
    expect(notificationHref({ branch_id: BRANCH_A, category: "lpg" })).toBe(
      `/branches/${BRANCH_A}/lpg`,
    );

    const unread = computeUnreadNotifications(merged, "2026-11-16T01:00:06Z");
    expect(unread.unreadCount).toBe(1);
    expect(notificationVisuals(txEvent).kindLabel).toBe("Running");
  });

  it("normalizes lowercase states, detects machine maintenance transitions, upgrades tx faults with incident_id, and compares timestamps by epoch", () => {
    const seeded = detectNotificationTransitions(
      null,
      [makeDevice({ state: "error" as never, fault_code: "E01" })],
      "2026-11-24T00:00:00Z",
    );
    expect(seeded.nextMap[`${BRANCH_A}:washer-01`].state).toBe("ERROR");

    const maintStep = detectNotificationTransitions(
      seeded.nextMap,
      [makeDevice({ state: "maintenance" as never, fault_code: "E01", sample_at: "2026-11-24T00:00:10Z" })],
      "2026-11-24T00:00:10Z",
    );
    expect(maintStep.triggeredEvents).toHaveLength(1);
    expect(maintStep.triggeredEvents[0].kind).toBe("machine_maintenance");
    expect(notificationVisuals(maintStep.triggeredEvents[0]).kindLabel).toBe("Maintenance");

    const txFault: WorkspaceNotificationEvent = {
      id: `tx:${BRANCH_A}:machine:washer-01:error:2026-11-24T00:00:00Z`,
      branch_id: BRANCH_A,
      branch_name: "MSU Shah Alam",
      category: "machine",
      kind: "machine_fault",
      severity: "negative",
      title: "Machine fault",
      detail: "Washer 01 reported fault E01",
      source_id: "washer-01",
      device_label: "Washer 01",
      occurred_at: "2026-11-24T00:00:00Z",
      active: true,
    };
    const durableIncidentFault: WorkspaceNotificationEvent = {
      ...txFault,
      id: "incident:inc-e01",
      incident_id: "inc-e01",
      occurred_at: "2026-11-24T00:00:01.250000Z",
    };

    const merged = mergeNotificationEvents([durableIncidentFault], [txFault]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("incident:inc-e01");
    expect(notificationHref(merged[0])).toBe(`/branches/${BRANCH_A}/incidents/inc-e01`);

    // Ensure "12Z" is NOT falsely counted unread against "12.500Z" (ASCII 'Z' > '.')
    const epochCheck = computeUnreadNotifications(
      [{ ...txFault, occurred_at: "2026-11-24T00:00:12Z" }],
      "2026-11-24T00:00:12.500Z",
    );
    expect(epochCheck.unreadCount).toBe(0);

    // Durable maintcmd replaces transient tx maintenance notice, and maintlog routes to /maintenance
    const txMaint: WorkspaceNotificationEvent = {
      ...txFault,
      id: `tx:${BRANCH_A}:machine:washer-01:maintenance:2026-11-24T00:01:00Z`,
      kind: "machine_maintenance",
      severity: "warning",
      title: "Machine under maintenance",
      occurred_at: "2026-11-24T00:01:00Z",
    };
    const durableMaintCmd: WorkspaceNotificationEvent = {
      ...txMaint,
      id: "maintcmd:cmd-1",
      title: "Machine set to maintenance",
      occurred_at: "2026-11-24T00:01:02Z",
    };
    const completedMaintLog: WorkspaceNotificationEvent = {
      ...txFault,
      id: "maintlog:log-1",
      kind: "machine_maintenance_logged",
      severity: "positive",
      title: "Maintenance completed",
      detail: "Washer 01 (E01) serviced by Ali Tech",
      reference_code: "MNT-123456",
      occurred_at: "2026-11-24T00:05:00Z",
      active: false,
    };

    const mergedMaint = mergeNotificationEvents(
      [durableMaintCmd, completedMaintLog],
      [txMaint],
    );
    expect(mergedMaint.map((m) => m.id)).toEqual(["maintlog:log-1", "maintcmd:cmd-1"]);
    expect(notificationVisuals(completedMaintLog).kindLabel).toBe("Serviced");
    expect(notificationHref(completedMaintLog)).toBe(`/branches/${BRANCH_A}/maintenance`);
  });
});

describe("WorkspaceShell header notification placement", () => {
  it("renders notification bell between navigation links and profile button for active organizations", () => {
    const html = renderToString(
      React.createElement(
        WorkspaceShell,
        {
          title: "Branches",
          organization: "SpinSense HQ",
          owner: true,
          userRole: "owner",
        },
        React.createElement("div", null, "Content"),
      ),
    );

    const navPos = html.indexOf('aria-label="Operator navigation"');
    const bellPos = html.indexOf('id="notificationsButton"');
    const profilePos = html.indexOf('id="user-menu-button"');

    expect(navPos).toBeGreaterThan(-1);
    expect(bellPos).toBeGreaterThan(navPos);
    expect(profilePos).toBeGreaterThan(bellPos);
    expect(html).toContain("min-h-11 min-w-11");
    expect(html).toContain("rounded-full");
    expect(html).toContain("fixed inset-x-0 top-0");
    expect(html).not.toContain("<header className=\"fixed inset-x-0 top-0 z-30 border-b border-line bg-navy/95 backdrop-blur-md\"");
    expect(html).not.toContain("bg-navy/95 backdrop-blur-md\"><div className=\"mx-auto flex min-h-16");
    expect(html).toContain("hidden border-t border-line bg-canvas md:block");
    expect(html).not.toContain("fixed inset-x-0 bottom-0");
    expect(html).toContain("/spinsense.svg");
    expect(html).not.toContain("lucide-washing-machine");
    expect(html).toContain("© 2026 SpinSense");
  });

  it("hides notification bell when organization is missing or notificationsEnabled is false", () => {
    const noOrgHtml = renderToString(
      React.createElement(
        WorkspaceShell,
        { title: "Branches" },
        React.createElement("div", null, "Error notice"),
      ),
    );
    expect(noOrgHtml).not.toContain('id="notificationsButton"');

    const unassignedHtml = renderToString(
      React.createElement(
        WorkspaceShell,
        {
          title: "Branches",
          organization: "SpinSense HQ",
          notificationsEnabled: false,
        },
        React.createElement("div", null, "Unassigned notice"),
      ),
    );
    expect(unassignedHtml).not.toContain('id="notificationsButton"');
  });
});

describe("PWA manifest, push-only service worker, and PushNotificationToggle", () => {
  it("exports SpinSense manifest pointing to /branches and static PNG icons", () => {
    const data = manifest();
    expect(data.start_url).toBe("/branches");
    expect(data.display).toBe("standalone");
    expect(data.background_color).toBe("#171719");
    expect(data.theme_color).toBe("#14243a");
    expect(data.icons?.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
  });

  it("keeps public/sw.js strictly push-only without fetch/API caching", () => {
    const swPath = path.resolve(process.cwd(), "public", "sw.js");
    const swSource = fs.readFileSync(swPath, "utf8");
    expect(swSource).toContain('addEventListener("push"');
    expect(swSource).toContain('addEventListener("notificationclick"');
    expect(swSource).not.toContain('addEventListener("fetch"');
    expect(swSource).not.toContain("caches.open");
    expect(swSource).toContain('return "/branches"');
  });

  it("converts base64url VAPID public keys and guards SSR/iOS push detection", () => {
    const bytes = urlBase64ToUint8Array("AQAB");
    expect(Array.from(bytes)).toEqual([1, 0, 1]);
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);

    expect(detectPushSupport()).toEqual({ supported: false, reason: "unsupported" });
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)")).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });

  it("renders PushNotificationToggle safely during SSR and maps status descriptions", () => {
    const cardHtml = renderToString(React.createElement(PushNotificationToggle, { variant: "card" }));
    expect(cardHtml).toContain("Device Push Alerts");
    expect(cardHtml).toContain("bg-surface");

    const inlineHtml = renderToString(React.createElement(PushNotificationToggle, { variant: "inline" }));
    expect(inlineHtml).toContain("Device push alerts");

    expect(describePushStatus("enabled").canToggle).toBe(true);
    expect(describePushStatus("disabled").canToggle).toBe(true);
    expect(describePushStatus("denied").canToggle).toBe(false);
    expect(describePushStatus("ios_install_required").detail).toContain("Home Screen");
    expect(describePushStatus("insecure_context").label).toBe("HTTPS required");
  });
});
