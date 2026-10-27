import type { Metadata } from "next";
import "./globals.css";
import { SessionCleanup } from "@/components/auth/SessionCleanup";

export const metadata: Metadata = {
  title: { default: "SpinSense", template: "%s · SpinSense" },
  description: "Laundry operations, fuel monitoring and incident response for your team.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full scheme-dark">
      <body className="min-h-screen bg-canvas font-sans text-sm leading-normal text-ink antialiased"><SessionCleanup />{children}</body>
    </html>
  );
}
