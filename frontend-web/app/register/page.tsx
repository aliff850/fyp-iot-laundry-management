import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, UsersRound } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { textLink } from "@/lib/auth/styles";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  const choiceClass = "group flex min-h-28 items-center gap-4 rounded-md border border-control bg-navy p-5 transition-colors hover:bg-navy-hover active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none";
  return (
    <AuthShell title="Find your place in SpinSense" description="Create an organization or join the team you work with.">
      <div className="grid gap-4">
        <Link href="/register/owner" className={choiceClass}>
          <Building2 className="size-5 shrink-0 text-muted" aria-hidden="true" />
          <div className="flex-1"><h2 className="text-base font-semibold">I’m an owner</h2><p className="mt-1 text-sm leading-relaxed text-muted">Create an account for your laundry business.</p></div>
          <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>
        <Link href="/register/personnel" className={choiceClass}>
          <UsersRound className="size-5 shrink-0 text-muted" aria-hidden="true" />
          <div className="flex-1"><h2 className="text-base font-semibold">I’m joining a team</h2><p className="mt-1 text-sm leading-relaxed text-muted">Register as branch or maintenance personnel.</p></div>
          <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted">Already registered? <Link href="/login" className={textLink}>Log in</Link></p>
    </AuthShell>
  );
}
