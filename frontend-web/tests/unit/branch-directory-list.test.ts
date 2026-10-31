import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchDirectoryCard, BranchDirectoryList } from "@/components/workspace/branches/BranchDirectoryList";
import { BranchDirectoryView } from "@/components/workspace/branches/BranchDirectoryView";
import type { WorkspaceBranch } from "@/lib/auth/business";

// Mock useRouter for BranchDirectoryView
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockBranchOpen: WorkspaceBranch = {
  id: "branch-01",
  name: "MSU Shah Alam Prime",
  address: "Jalan Universiti 1",
  city: "Shah Alam",
  region: "Selangor",
  postal_code: "40100",
  contact_phone: "+603-5510-1234",
  opening_hours: "24 Hours",
  latitude: 3.0738,
  longitude: 101.5183,
  service_status: "open",
  primary_manager_user_id: "u-123",
  created_at: "2026-01-01T00:00:00Z",
};

const mockBranchClosed: WorkspaceBranch = {
  id: "branch-02",
  name: "Subang Jaya Hub",
  address: "Jalan SS 15/4",
  city: "Subang Jaya",
  region: "Selangor",
  postal_code: "47500",
  contact_phone: "+603-5633-5678",
  opening_hours: "08:00 - 22:00",
  latitude: null,
  longitude: null,
  service_status: "closed",
  primary_manager_user_id: "u-456",
  created_at: "2026-01-02T00:00:00Z",
};

describe("BranchDirectoryCard component", () => {
  it("renders branch name, address, hours, phone, and positive status badge for open branch", () => {
    const raw = renderToString(
      React.createElement(BranchDirectoryCard, {
        branch: mockBranchOpen,
        isSelected: false,
        owner: true,
        onSelect: () => {},
        onDelete: () => {},
      })
    );

    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("MSU Shah Alam Prime");
    expect(text).toContain("Jalan Universiti 1, Shah Alam, Selangor 40100");
    expect(text).toContain("Open to customers");
    expect(text).toContain("Map pin status");
    expect(text).toContain("Map pin active");
    expect(text).toContain("Working hours");
    expect(text).toContain("24 Hours");
    expect(text).toContain("Contact phone");
    expect(text).toContain("+603-5510-1234");
    expect(text).toContain("Dashboard");

    // Positive status badge styles
    expect(raw).toContain("text-positive");
    expect(raw).toContain("bg-positive");

    // Section 3.4 compliance: no inline middle-dots or decorative badge dots
    expect(raw).not.toContain("·");
    expect(raw).not.toContain("rounded-full bg-");

    // Clear separation with structured responsive grid (grid-cols-1 sm:grid-cols-3)
    expect(raw).toContain("grid-cols-1 gap-2 sm:grid-cols-3");
    expect(raw).toContain("text-ink");
    expect(raw).toContain("text-muted");

    // Semantic article container without nested role="button"
    expect(raw).toContain("<article");
    expect(raw).not.toContain('role="button"');

    // Minimum 44px touch targets on interactive controls
    expect(raw).toMatch(/<button[^>]*min-h-11[^>]*>(?:(?!<\/button>)[\s\S])*?<span[^>]*>MSU Shah Alam Prime<\/span>/);
    expect(raw).toMatch(/<button[^>]*min-h-11[^>]*min-w-11[^>]*aria-label="Delete MSU Shah Alam Prime"/);
    expect(raw).toMatch(/<a[^>]*min-h-11[^>]*href="\/branches\/branch-01"/);
  });

  it("renders closed status badge and location not set when coordinates are missing", () => {
    const raw = renderToString(
      React.createElement(BranchDirectoryCard, {
        branch: mockBranchClosed,
        isSelected: true,
        owner: false,
      })
    );

    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Subang Jaya Hub");
    expect(text).toContain("Closed to customers");
    expect(text).toContain("Location not set");

    // Selected state styling
    expect(raw).toContain("bg-navy");
    expect(raw).toContain("border-accent/40");

    // Delete button omitted when owner is false
    expect(raw).not.toContain("aria-label=\"Delete Subang Jaya Hub\"");
  });
});

describe("BranchDirectoryList component", () => {
  it("renders multiple branches inside an accessible list", () => {
    const raw = renderToString(
      React.createElement(BranchDirectoryList, {
        branches: [mockBranchOpen, mockBranchClosed],
        selectedId: "branch-01",
        owner: true,
      })
    );

    expect(raw).toContain('role="list"');
    expect(raw).toContain('aria-label="Branch directory list"');
    expect(raw).toContain("MSU Shah Alam Prime");
    expect(raw).toContain("Subang Jaya Hub");

    // branch-01 is selected, branch-02 is unselected
    expect(raw).toContain('aria-pressed="true"');
    expect(raw).toContain('aria-pressed="false"');
  });
});

describe("BranchDirectoryView component", () => {
  it("renders locations count and standalone BranchDirectoryList with Add branch button for owner", () => {
    const raw = renderToString(
      React.createElement(BranchDirectoryView, {
        branches: [mockBranchOpen, mockBranchClosed],
        owner: true,
      })
    );

    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Locations");
    expect(text).toContain("2 locations available");
    expect(text).toContain("Add branch");
    expect(text).toContain("MSU Shah Alam Prime");
    expect(text).toContain("Subang Jaya Hub");

    // Add branch link enforces min-h-11 touch target
    expect(raw).toMatch(/<a[^>]*min-h-11[^>]*href="\/branches\/new"/);
  });
});

