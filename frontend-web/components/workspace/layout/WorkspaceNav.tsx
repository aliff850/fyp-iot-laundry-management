import React from "react";
import Link from "next/link";
import { User, type LucideIcon } from "lucide-react";
import { MobileSignOutTab } from "./MobileSignOutTab";

export interface WorkspaceNavItem {
  id: string;
  label: string;
  href: string;
  icon:
    | LucideIcon
    | React.ComponentType<{
        className?: string;
        "aria-hidden"?: boolean | "true" | "false";
      }>;
  visible?: boolean;
}

export interface WorkspaceNavProps {
  items: WorkspaceNavItem[];
  activeId: string;
  ariaLabel?: string;
  className?: string;
  role?: "navigation" | "tablist";
}

export function WorkspaceNav({
  items,
  activeId,
  ariaLabel = "Operator navigation",
  className = "",
  role = "navigation",
}: WorkspaceNavProps) {
  const visibleItems = items.filter(item => item.visible !== false);
  const isTabList = role === "tablist";

  if (isTabList) {
    return (
      <div
        aria-label={ariaLabel}
        role="tablist"
        className={`flex items-center gap-2 overflow-x-auto ${className}`.trim()}
      >
        {visibleItems.map(item => {
          const isActive = activeId === item.id;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              role="tab"
              aria-selected={isActive}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                isActive
                  ? "border-accent font-semibold text-ink"
                  : "border-transparent text-muted hover:border-line hover:text-ink"
              }`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  const hasAccountInItems = visibleItems.some(i => i.id === "account");
  const hasPersonnel = visibleItems.some(i => i.id === "personnel");

  return (
    <>
      {/* Desktop Header Navigation (hidden on mobile) */}
      <nav
        aria-label={ariaLabel}
        className={`hidden md:flex items-center gap-2 overflow-x-auto ${className}`.trim()}
      >
        {visibleItems.map(item => {
          const isActive = activeId === item.id;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                isActive
                  ? "border-accent font-semibold text-ink"
                  : "border-transparent text-muted hover:border-line hover:text-ink"
              }`}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Mobile PWA Bottom Navigation Dock (hidden on desktop) */}
      <nav
        aria-label="Mobile workspace navigation"
        className="flex md:hidden fixed bottom-0 inset-x-0 z-40 items-center justify-around border-t border-line bg-navy/95 px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md shadow-[0_-4px_16px_rgba(0,0,0,0.35)]"
      >
        <div
          className={`grid w-full ${
            hasPersonnel ? "grid-cols-4" : "grid-cols-3"
          } gap-1 max-w-lg mx-auto`}
        >
          {visibleItems.map(item => {
            const isActive = activeId === item.id;
            const Icon = item.icon;

            return (
              <Link
                key={`mobile-${item.id}`}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center justify-center min-h-[52px] py-1 px-1 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  isActive
                    ? "text-accent font-semibold bg-navy-selected/40"
                    : "text-muted hover:text-ink hover:bg-navy-hover/40"
                }`}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span className="text-[10px] sm:text-xs font-medium tracking-tight mt-1 truncate max-w-full">
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Account Tab */}
          {!hasAccountInItems && (
            <Link
              href="/account"
              aria-current={activeId === "account" ? "page" : undefined}
              className={`flex flex-col items-center justify-center min-h-[52px] py-1 px-1 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                activeId === "account"
                  ? "text-accent font-semibold bg-navy-selected/40"
                  : "text-muted hover:text-ink hover:bg-navy-hover/40"
              }`}
            >
              <User className="size-5 shrink-0" aria-hidden="true" />
              <span className="text-[10px] sm:text-xs font-medium tracking-tight mt-1 truncate max-w-full">
                Account
              </span>
            </Link>
          )}

          {/* Sign Out Action Tab */}
          <MobileSignOutTab />
        </div>
      </nav>
    </>
  );
}
