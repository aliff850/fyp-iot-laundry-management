import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicShell } from "@/components/auth/AuthShell";
import { primaryButton, secondaryButton } from "@/lib/auth/styles";

export default function LandingPage() {
  return (
    <PublicShell>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-360 flex-1 items-center justify-center px-4 py-20 text-center md:px-6 md:py-28 xl:px-10"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
          <h1 className="text-4xl font-medium leading-tight tracking-tight text-ink md:text-6xl">
            Your laundry,
            <br />
            in view.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
            Monitor machines, track fuel and respond to incidents across your branches.
          </p>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
            <Link href="/login" className={`${primaryButton} w-full sm:w-auto`}>
              Log in
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>
            <Link href="/register" className={`${secondaryButton} w-full sm:w-auto`}>
              Register
            </Link>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
