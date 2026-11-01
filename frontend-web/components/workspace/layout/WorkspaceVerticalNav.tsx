"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Cpu,
  Flame,
  LayoutDashboard,
  Menu,
  MessageSquareWarning,
  Settings,
  Users,
  WashingMachine,
  X,
  type LucideIcon,
} from "lucide-react";

export type NavIconName =
  | "overview"
  | "machines"
  | "lpg"
  | "reports"
  | "customer-reports"
  | "personnel"
  | "details"
  | "branches"
  | "hardware-setup";

const ICON_MAP: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  machines: WashingMachine,
  lpg: Flame,
  reports: MessageSquareWarning,
  "customer-reports": MessageSquareWarning,
  personnel: Users,
  details: Settings,
  branches: Building2,
  "hardware-setup": Cpu,
};

export interface WorkspaceVerticalNavItem {
  id: string;
  label: string;
  href: string;
  icon?:
    | NavIconName
    | LucideIcon
    | React.ComponentType<{
        className?: string;
        "aria-hidden"?: boolean | "true" | "false";
      }>;
  visible?: boolean;
}

export interface WorkspaceVerticalNavProps {
  items: WorkspaceVerticalNavItem[];
  activeId: string;
  ariaLabel?: string;
  className?: string;
  defaultCollapsed?: boolean;
}

function resolveIcon(item: WorkspaceVerticalNavItem): LucideIcon | React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> {
  if (typeof item.icon === "string") {
    return ICON_MAP[item.icon] ?? LayoutDashboard;
  }
  if (item.icon) {
    return item.icon;
  }
  return ICON_MAP[item.id] ?? LayoutDashboard;
}

export function WorkspaceVerticalNav({
  items,
  activeId,
  ariaLabel = "Branch workspace navigation",
  className = "",
  defaultCollapsed = false,
}: WorkspaceVerticalNavProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("spinsense_branch_nav_collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // Ignore localStorage error in SSR / strict privacy modes
    }
  }, []);

  const toggleCollapse = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsMobileOpen(prev => !prev);
      return;
    }

    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem("spinsense_branch_nav_collapsed", String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const visibleItems = items.filter(item => item.visible !== false);
  const activeItem = visibleItems.find(item => item.id === activeId) ?? visibleItems[0];
  const ActiveIcon = activeItem ? resolveIcon(activeItem) : null;

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-col rounded-md border border-line bg-surface p-2.5 transition-all duration-200 md:sticky md:top-6 shrink-0 ${
        isCollapsed ? "w-full md:w-16" : "w-full md:w-56"
      } ${className}`.trim()}
    >
      {/* Top Header / Hamburger Row */}
      <div
        className={`flex items-center border-b border-rule pb-2 mb-2 justify-between ${
          isCollapsed ? "md:justify-center md:px-0" : "px-1"
        }`}
      >
        {/* Mobile current active tab indicator (hidden on md+) */}
        <div className="flex items-center gap-2 md:hidden min-w-0">
          {ActiveIcon && <ActiveIcon className="size-4 shrink-0 text-accent" aria-hidden="true" />}
          <span className="truncate text-xs font-semibold text-ink">
            {activeItem?.label ?? "Navigation"}
          </span>
        </div>

        {/* Desktop title label when expanded (hidden on mobile and hidden when collapsed on desktop) */}
        {!isCollapsed && (
          <span className="hidden md:inline text-xs font-semibold uppercase tracking-wider text-muted">
            Menu
          </span>
        )}

        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={
            isMobileOpen
              ? "Close navigation"
              : isCollapsed
              ? "Expand navigation"
              : "Collapse navigation"
          }
          aria-expanded={isMobileOpen || !isCollapsed}
          className="inline-flex size-8 items-center justify-center rounded-md border border-control bg-navy text-muted transition-colors hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          {isMobileOpen ? (
            <>
              <X className="size-4 md:hidden" aria-hidden="true" />
              <Menu className="hidden md:block size-4" aria-hidden="true" />
            </>
          ) : (
            <Menu className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Navigation Items List */}
      <div
        className={`${
          isMobileOpen ? "flex" : "hidden"
        } md:flex flex-col gap-1`}
        role="list"
      >
        {visibleItems.map(item => {
          const isActive = activeId === item.id;
          const Icon = resolveIcon(item);

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setIsMobileOpen(false)}
              title={isCollapsed ? item.label : undefined}
              aria-label={isCollapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-md border-l-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                isCollapsed
                  ? "justify-start gap-3 px-2.5 py-2 md:justify-center md:gap-0 md:px-2"
                  : "gap-3 px-2.5 py-2"
              } ${
                isActive
                  ? "border-accent bg-navy-selected font-semibold text-ink"
                  : "border-transparent text-muted hover:border-line hover:bg-navy-hover hover:text-ink"
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {isCollapsed ? (
                <span className="truncate md:sr-only">{item.label}</span>
              ) : (
                <span className="truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

