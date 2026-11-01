import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { HardwareSetupView } from "@/components/workspace/hardware/HardwareSetupView";
import {
  getBranch,
  getBranchDeviceDiscoveries,
  getBranchGateways,
  getCurrentGatewayClaim,
  getMembership,
} from "@/lib/auth/business";
import { Notice } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Hardware Setup · SpinSense" };
export const dynamic = "force-dynamic";

interface HardwareSetupPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function HardwareSetupPage({ params }: HardwareSetupPageProps) {
  const { branchId } = await params;

  const [membershipRes, branchRes, gatewaysRes, claimRes, discoveriesRes] =
    await Promise.all([
      getMembership(),
      getBranch(branchId),
      getBranchGateways(branchId),
      getCurrentGatewayClaim(branchId),
      getBranchDeviceDiscoveries(branchId),
    ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fhardware-setup`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;
  // PRD: Only owner and branch_manager may access Hardware Setup
  if (role !== "owner" && role !== "branch_manager") {
    if (role === "machine_maintenance") redirect(`/branches/${branchId}/machines`);
    if (role === "lpg_maintenance") redirect(`/branches/${branchId}/lpg`);
    redirect("/branches");
  }

  if (!branchRes.ok) {
    return (
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto max-w-4xl">
          <Notice>{branchRes.message}</Notice>
          <div className="mt-4">
            <Link
              href="/branches"
              className="text-xs text-accent underline hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              ← Return to Branch Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const branch = branchRes.value;
  const isOwner = role === "owner";
  const gateways = gatewaysRes.ok && gatewaysRes.value ? gatewaysRes.value : [];
  const currentClaim = claimRes.ok ? claimRes.value : null;
  const discoveries = discoveriesRes.ok && discoveriesRes.value ? discoveriesRes.value : [];

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="hardware-setup"
      userRole={role}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-ink">
            Hardware & Gateway Setup
          </h1>
          <p className="mt-1 text-sm text-muted">
            Commission and monitor your Raspberry Pi 5 edge gateway and discover connected IoT devices.
          </p>
        </div>

        <HardwareSetupView
          branchId={branchId}
          initialGateways={gateways}
          initialClaim={currentClaim}
          initialDiscoveries={discoveries}
          isOwner={isOwner}
        />
      </div>
    </BranchWorkspaceShell>
  );
}

