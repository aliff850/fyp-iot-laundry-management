import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm, Notice } from "@/components/auth/AuthForm";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";
import { textLink } from "@/lib/auth/styles";

export const metadata: Metadata = { title: "Check your email" };
export const dynamic = "force-dynamic";

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ confirmation?: string }> }) {
  const { confirmation } = await searchParams;
  const messages: Record<string, string> = {
    expired: "This confirmation link has expired. Request a new email below.",
    invalid: "This confirmation link is invalid or has already been used. Try logging in, or request a new email.",
    unavailable: "We couldn't complete email confirmation. Please try again or request a new email later.",
  };
  const message = confirmation && Object.hasOwn(messages, confirmation) ? messages[confirmation] : null;
  return <AuthShell title="Check your email" description="If registration was accepted, you’ll receive a confirmation email. Follow the link, then return to log in.">
    <div className="space-y-6">
      {message && <Notice>{message}</Notice>}
      <p className="text-sm leading-relaxed text-muted">Check your spam folder too. Need another link? Enter the email address you registered with.</p>
      <AuthForm mode="resend" configured={Boolean(getAuthConfig() && getSiteUrl())} />
      <Link href="/login" className={textLink}>Back to log in</Link>
    </div>
  </AuthShell>;
}
