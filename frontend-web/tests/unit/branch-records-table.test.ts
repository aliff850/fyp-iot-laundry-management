import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchRecordsTable } from "@/components/workspace/records/BranchRecordsTable";
import type { BranchRecordsResponse } from "@/lib/auth/business";

vi.mock("@/app/branches/[branchId]/overview/actions", () => ({
  fetchBranchRecords: vi.fn(),
  fetchBranchOverviewAnalytics: vi.fn(),
}));

const BRANCH_ID = "22222222-2222-2222-2222-222222222222";

describe("BranchRecordsTable component", () => {
  it("renders Overview mode with LPG & Machines switcher, All time default, and pagination", () => {
    const initialData: BranchRecordsResponse = {
      branch_id: BRANCH_ID,
      scope: "lpg",
      period: "all",
      page: 1,
      page_size: 10,
      total: 25,
      total_pages: 3,
      items: [
        {
          record_id: "rec-1",
          source_id: "esp32-lpg-01",
          device_label: "Main Weigh Station",
          sample_at: "2026-11-16T00:15:00Z",
          received_at: "2026-11-16T00:15:02Z",
          source_time_quality: "device_reported",
          source_kind: "physical",
          lpg_percent: 64.2,
          lpg_weight_kg: 8.99,
          gross_weight_kg: 22.99,
          estimated_ppm: 14.5,
          gas_condition: "normal",
          weight_valid: true,
          maintenance_mode: false,
        },
        {
          record_id: "rec-2",
          source_id: "esp32-lpg-02",
          device_label: "Reserve Tank",
          sample_at: "2026-11-16T00:10:00Z",
          received_at: "2026-11-16T00:10:02Z",
          source_time_quality: "device_reported",
          source_kind: "simulated",
          lpg_percent: null,
          lpg_weight_kg: null,
          gross_weight_kg: null,
          estimated_ppm: null,
          gas_condition: null,
          weight_valid: false,
          maintenance_mode: false,
        },
      ],
    };

    const html = renderToString(
      React.createElement(BranchRecordsTable, {
        branchId: BRANCH_ID,
        allowedScopes: ["lpg", "machines"],
        defaultScope: "lpg",
        title: "Recent records",
        showPrice: true,
        initialData,
      })
    ).replace(/<!--.*?-->/g, "");

    expect(html).toContain("Recent records");
    expect(html).toContain("LPG &amp; Gas");
    expect(html).toContain("Machines");
    expect(html).toContain("All time");
    expect(html).toContain("Showing 1–2 of 25 LPG records");
    expect(html).toContain("Page 1 of 3");
    expect(html).toContain("Main Weigh Station");
    expect(html).toContain("64.2% (8.99 kg)");
    expect(html).toContain("14.5 ppm (Normal)");
    expect(html).toContain("Scale fault");
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
  });

  it("omits financial price columns when showPrice is false on Machines page for specialists", () => {
    const initialData: BranchRecordsResponse = {
      branch_id: BRANCH_ID,
      scope: "machines",
      period: "all",
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1,
      items: [
        {
          cycle_id: "cycle-1",
          source_id: "sim-washer-01",
          device_label: "Washer 01",
          device_type: "washer",
          program_id: "heavy",
          program_label: "Heavy Duty",
          running_seconds: 2400,
          running_minutes: 40.0,
          outcome: "completed",
          started_at: "2026-11-16T00:00:00Z",
          finished_at: "2026-11-16T00:40:00Z",
        },
      ],
    };

    const specialistHtml = renderToString(
      React.createElement(BranchRecordsTable, {
        branchId: BRANCH_ID,
        allowedScopes: ["machines"],
        defaultScope: "machines",
        title: "Machine cycle records",
        showPrice: false,
        initialData,
      })
    ).replace(/<!--.*?-->/g, "");

    expect(specialistHtml).toContain("Machine cycle records");
    expect(specialistHtml).toContain("Washer 01");
    expect(specialistHtml).toContain("Heavy Duty");
    expect(specialistHtml).toContain("40.0 min");
    expect(specialistHtml).not.toContain("LPG &amp; Gas");
    expect(specialistHtml).not.toContain("Amount");
    expect(specialistHtml).not.toContain("RM ");

    const ownerHtml = renderToString(
      React.createElement(BranchRecordsTable, {
        branchId: BRANCH_ID,
        allowedScopes: ["machines"],
        defaultScope: "machines",
        title: "Machine cycle records",
        showPrice: true,
        initialData: {
          ...initialData,
          items: [
            {
              ...(initialData.items[0] as Extract<
                BranchRecordsResponse["items"][number],
                { cycle_id: string }
              >),
              price_myr: "8.50",
            },
          ],
        },
      })
    ).replace(/<!--.*?-->/g, "");

    expect(ownerHtml).toContain("Amount");
    expect(ownerHtml).toContain("RM 8.50");
  });

  it("supports Temp & Humidity scoped view on LPG & Safety page without machine category", () => {
    const initialData: BranchRecordsResponse = {
      branch_id: BRANCH_ID,
      scope: "env",
      period: "today",
      page: 1,
      page_size: 10,
      total: 1,
      total_pages: 1,
      items: [
        {
          record_id: "rec-env-1",
          source_id: "esp32-lpg-01",
          device_label: "Main Weigh Station",
          sample_at: "2026-11-16T00:10:00Z",
          received_at: "2026-11-16T00:10:01Z",
          source_time_quality: "device_reported",
          source_kind: "physical",
          temperature: 29.4,
          humidity: 61.2,
          temperature_valid: true,
          humidity_valid: true,
        },
      ],
    };

    const html = renderToString(
      React.createElement(BranchRecordsTable, {
        branchId: BRANCH_ID,
        allowedScopes: ["lpg", "env"],
        defaultScope: "env",
        title: "LPG & environmental records",
        initialData,
        initialError: "Live polling warning",
      })
    ).replace(/<!--.*?-->/g, "");

    expect(html).toContain("LPG &amp; Gas");
    expect(html).toContain("Temp &amp; Humidity");
    expect(html).not.toContain("Machines");
    expect(html).toContain("29.4 °C");
    expect(html).toContain("61.2 %");
    expect(html).toContain("Live polling warning");
  });
});
