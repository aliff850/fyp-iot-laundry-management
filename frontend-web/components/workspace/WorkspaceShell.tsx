import type { ReactNode } from "react";
import Link from "next/link";
import { WashingMachine } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";

export function WorkspaceShell({ title, organization, owner = false, children }: {
  title: string; organization?: string; owner?: boolean; children: ReactNode;
}) {
  const nav = "inline-flex min-h-11 items-center rounded-sm px-2 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return <div className="min-h-screen bg-canvas">
    <a href="#main-content" className="sr-only rounded-md bg-ink p-3 text-surface focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Skip to content</a>
    <header className="border-b border-navy-selected bg-navy">
      <div className="mx-auto flex w-full max-w-360 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6 xl:px-10">
        <Link href="/branches" aria-label="SpinSense Branches" className="inline-flex min-h-11 items-center gap-2 rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><WashingMachine className="size-5 text-accent" aria-hidden="true" />SpinSense</Link>
        <nav aria-label="Operator navigation" className="flex flex-wrap items-center gap-2">
          <Link href="/branches" aria-current={title === "Branches" ? "page" : undefined} className={nav + (title === "Branches" ? " border-b-2 border-accent text-ink" : "")}>Branches</Link>
          {owner && <Link href="/personnel" className={nav}>Personnel</Link>}
        </nav>
      </div>
    </header>
    <main id="main-content" className="mx-auto w-full max-w-360 px-4 py-8 md:px-6 md:py-10 xl:px-10">
      {organization && <p className="mb-7 text-xs text-faint">{organization} / {title}</p>}
      {children}
    </main>
    <footer className="mx-auto flex w-full max-w-360 flex-wrap items-center justify-between gap-4 border-t border-line px-4 py-6 md:px-6 xl:px-10"><span className="text-xs text-faint">SpinSense operator workspace</span><div className="w-32"><SignOutButton /></div></footer>
  </div>;
}
