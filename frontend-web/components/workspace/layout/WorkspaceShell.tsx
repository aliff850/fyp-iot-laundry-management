import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, Users, WashingMachine } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationCenter } from "@/components/workspace/notifications/NotificationCenter";
import {
  WorkspaceNav,
  type WorkspaceNavItem,
} from "@/components/workspace/layout/WorkspaceNav";

export function WorkspaceShell({
  title,
  organization,
  owner = false,
  notificationsEnabled,
  currentBranchId,
  userRole = null,
  children,
}: {
  title: string;
  organization?: string;
  owner?: boolean;
  notificationsEnabled?: boolean;
  currentBranchId?: string;
  userRole?: string | null;
  children?: ReactNode;
}) {
  const showNotifications = notificationsEnabled ?? Boolean(organization);
  const isBranches = title === "Branches" || title === "Create branch";
  const isPersonnel = title === "Personnel" || title === "Requests";
  const isAccount = title === "Account";

  const navItems: WorkspaceNavItem[] = [
    {
      id: "branches",
      label: "Branches",
      href: "/branches",
      icon: Building2,
      visible: true,
    },
    {
      id: "personnel",
      label: "Personnel",
      href: "/personnel",
      icon: Users,
      visible: owner,
    },
  ];

  const activeId = isBranches ? "branches" : isPersonnel ? "personnel" : isAccount ? "account" : "";

  return (
    <div className="min-h-screen bg-canvas font-sans text-sm leading-normal text-ink scheme-dark">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-ink p-3 text-surface focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      <header className="border-b border-line bg-navy">
        <div className="mx-auto flex min-h-16 w-full max-w-360 items-center justify-between gap-4 px-4 md:min-h-19 md:px-6 xl:px-10">
          <Link
            href="/branches"
            aria-label="SpinSense Branches"
            className="inline-flex items-center gap-3 text-lg font-semibold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <WashingMachine className="size-7 shrink-0 text-accent" aria-hidden="true" />
            <span>SpinSense</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
            <WorkspaceNav
              items={navItems}
              activeId={activeId}
              ariaLabel="Operator navigation"
            />

            {showNotifications && (
              <NotificationCenter
                currentBranchId={currentBranchId}
                userRole={userRole}
              />
            )}

            <div className="hidden md:block">
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto w-full max-w-360 px-4 pt-6 pb-24 md:px-6 md:pt-9 md:pb-7 xl:px-10"
      >
        {organization && (
          <div className="mb-6 flex items-center gap-2 text-xs text-faint">
            <span className="font-medium text-muted">{organization}</span>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </div>
        )}
        {children}
      </main>

      <footer className="mx-auto flex w-full max-w-360 flex-wrap items-center justify-between gap-4 border-t border-line px-4 py-6 md:px-6 xl:px-10">
        <span className="text-xs text-faint">SpinSense operator workspace</span>
      </footer>
    </div>
  );
}
