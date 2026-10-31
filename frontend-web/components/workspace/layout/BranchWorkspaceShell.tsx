import React, { type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Phone } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import {
  WorkspaceVerticalNav,
  type WorkspaceVerticalNavItem,
} from "@/components/workspace/layout/WorkspaceVerticalNav";
import type { BranchDetail } from "@/lib/auth/business";

export type BranchWorkspaceTab =
  | "overview"
  | "machines"
  | "lpg"
  | "customer-reports"
  | "personnel"
  | "details";

interface BranchWorkspaceShellProps {
  branch: BranchDetail;
  activeTab: BranchWorkspaceTab;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  organizationName?: string;
  children?: ReactNode;
}

export function BranchWorkspaceShell({
  branch,
  activeTab,
  userRole,
  organizationName = "Your Organization",
  children,
}: BranchWorkspaceShellProps) {
  const isOwner = userRole === "owner";
  const isManager = userRole === "branch_manager";
  const isMachineTech = userRole === "machine_maintenance";
  const isLpgTech = userRole === "lpg_maintenance";

  // Navigation tab definitions with PRD role permissions
  const tabs: WorkspaceVerticalNavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: `/branches/${branch.id}/overview`,
      icon: "overview",
      visible: isOwner || isManager,
    },
    {
      id: "machines",
      label: "Machines",
      href: `/branches/${branch.id}/machines`,
      icon: "machines",
      visible: isOwner || isManager || isMachineTech,
    },
    {
      id: "lpg",
      label: "LPG & Safety",
      href: `/branches/${branch.id}/lpg`,
      icon: "lpg",
      visible: isOwner || isManager || isLpgTech,
    },
    {
      id: "customer-reports",
      label: "Reports",
      href: `/branches/${branch.id}/customer-reports`,
      icon: "reports",
      visible: isOwner || isManager || isMachineTech || isLpgTech,
    },
    {
      id: "personnel",
      label: "Branch Personnel",
      href: `/branches/${branch.id}/personnel`,
      icon: "personnel",
      visible: isOwner || isManager,
    },
    {
      id: "details",
      label: "Details & Setup",
      href: `/branches/${branch.id}/details`,
      icon: "details",
      visible: isOwner || isManager,
    },
  ];

  return (
    <WorkspaceShell title="Branches" organization={organizationName} owner={isOwner}>
      <div className="space-y-6 md:space-y-8">
        {/* Breadcrumb Bar */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted">
          <Link
            href="/branches"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>Branches</span>
          </Link>
          <span className="text-line">/</span>
          <span className="font-medium text-ink truncate max-w-xs">{branch.name}</span>
        </nav>

        {/* Main Branch Workspace Layout with Vertical Navigation on Left */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {/* Left Column: Vertical Collapsible Navigation */}
          <WorkspaceVerticalNav
            items={tabs}
            activeId={activeTab}
            ariaLabel="Branch workspace navigation"
          />

          {/* Right Column: Hero Card & Active Tab Content */}
          <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
            {/* Branch Identity & Meta Hero Card */}
            <div className="rounded-md border border-line bg-surface p-5 md:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl font-semibold tracking-tight text-ink">
                      {branch.name}
                    </h1>
                    <span
                      className={`rounded border px-2 py-0.5 text-xs font-medium ${
                        branch.service_status === "open"
                          ? "border-positive/30 bg-positive/10 text-positive"
                          : "border-warning/30 bg-warning/10 text-warning"
                      }`}
                    >
                      {branch.service_status === "open"
                        ? "Open to customers"
                        : "Closed to customers"}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {branch.address}, {branch.city}, {branch.region} {branch.postal_code}
                  </p>
                </div>

                {/* Quick Metadata Badge Group */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted sm:justify-end">
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-faint" aria-hidden="true" />
                    <span>{branch.opening_hours}</span>
                  </div>
                  <span className="text-line">·</span>
                  <div className="flex items-center gap-1.5">
                    <Phone className="size-3.5 text-faint" aria-hidden="true" />
                    <span>{branch.contact_phone}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <main id="branch-content" className="space-y-6">
              {children}
            </main>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
