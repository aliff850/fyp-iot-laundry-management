import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, WashingMachine } from "lucide-react";
import { textLink } from "@/lib/auth/styles";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only rounded-md bg-ink p-3 text-surface focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Skip to content</a>
      <header className="border-b border-line bg-navy">
        <div className="mx-auto flex min-h-18 w-full max-w-360 items-center justify-between gap-4 px-4 md:px-6 xl:px-10">
          <Link href="/" aria-label="SpinSense home" className="inline-flex min-h-11 items-center gap-2.5 rounded-sm text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            <WashingMachine className="size-5 text-accent" aria-hidden="true" />
            SpinSense
          </Link>
          <span className="text-xs text-muted">Operator workspace</span>
        </div>
      </header>
      {children}
      <footer className="mx-auto flex w-full max-w-360 items-center justify-between gap-4 px-4 py-5 text-xs text-faint md:px-6 xl:px-10">
        <span>SpinSense</span>
        <span>Laundry operations, connected.</span>
      </footer>
    </div>
  );
}

export function AuthShell({ title, description, children, backHref = "/", backLabel = "Back to home" }: {
  title: string;
  description: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <PublicShell>
      <main id="main-content" className="flex flex-1 flex-col items-center justify-center px-4 py-8 md:px-6 md:py-12">
        <div className="w-full max-w-lg">
          <Link href={backHref} className={textLink}><ArrowLeft className="size-4" aria-hidden="true" />{backLabel}</Link>
          <section className="mt-4 rounded-md border border-line bg-surface px-5 py-6 md:p-7" aria-labelledby="auth-title">
            <h1 id="auth-title" className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
            <div className="mt-7">{children}</div>
          </section>
        </div>
      </main>
    </PublicShell>
  );
}
