"use client";

import React, { useState } from "react";
import { CheckCircle, Clock, Radio } from "lucide-react";
import { DeviceApprovalModal } from "@/components/workspace/hardware/DeviceApprovalModal";
import type { DeviceDiscoveryItem } from "@/lib/auth/business";

interface PendingDiscoveriesListProps {
  branchId: string;
  discoveries: DeviceDiscoveryItem[];
  isOwner: boolean;
  onRefresh?: () => void;
}

export function PendingDiscoveriesList({
  branchId,
  discoveries,
  isOwner,
  onRefresh,
}: PendingDiscoveriesListProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<DeviceDiscoveryItem | null>(null);

  if (!discoveries || discoveries.length === 0) {
    return (
      <section className="rounded-md border border-line bg-surface p-4 sm:p-6" aria-labelledby="discoveriesHeading">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-muted stroke-current fill-none" aria-hidden="true" />
          <h2 id="discoveriesHeading" className="text-base font-semibold leading-normal text-ink">
            Pending Device Discoveries
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted">
          No new or unapproved IoT devices detected on this gateway. When new ESP32 nodes or machine simulators publish to the Pi broker, they will appear here for approval.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-line bg-surface p-4 sm:p-6" aria-labelledby="discoveriesHeading">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-accent stroke-current fill-none" aria-hidden="true" />
          <h2 id="discoveriesHeading" className="text-base font-semibold leading-normal text-ink">
            Pending Device Discoveries
          </h2>
          <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
            {discoveries.length}
          </span>
        </div>
      </div>

      {/* Desktop / Tablet Table View */}
      <div className="hidden sm:block overflow-x-auto rounded-md border border-rule">
        <table className="w-full text-left text-xs">
          <thead className="bg-raised text-muted uppercase tracking-wider border-b border-rule font-medium">
            <tr>
              <th className="px-4 py-3">Source ID</th>
              <th className="px-4 py-3">Proposed Type</th>
              <th className="px-4 py-3">First Seen</th>
              <th className="px-4 py-3">Last Seen</th>
              {isOwner && <th className="px-4 py-3 text-right">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule font-mono">
            {discoveries.map((d) => (
              <tr key={d.candidate_id} className="hover:bg-raised/50 transition-colors">
                <td className="px-4 py-3 font-semibold text-ink">{d.source_id}</td>
                <td className="px-4 py-3 text-muted">{d.proposed_type || "Unknown"}</td>
                <td className="px-4 py-3 text-faint">
                  {new Date(d.first_seen_at).toLocaleTimeString()}
                </td>
                <td className="px-4 py-3 text-faint">
                  {new Date(d.last_seen_at).toLocaleTimeString()}
                </td>
                {isOwner && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedCandidate(d)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded bg-ink px-3 py-1.5 font-sans text-xs font-semibold text-surface transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-accent active:translate-y-px"
                    >
                      <CheckCircle className="h-3.5 w-3.5 stroke-current fill-none" aria-hidden="true" />
                      <span>Approve</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Alternative (320px - 640px) */}
      <div className="sm:hidden space-y-3">
        {discoveries.map((d) => (
          <div key={d.candidate_id} className="rounded border border-rule bg-raised p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-ink">{d.source_id}</span>
              <span className="rounded bg-surface border border-line px-2 py-0.5 text-xs text-muted">
                {d.proposed_type || "Unknown"}
              </span>
            </div>
            <div className="text-xs text-faint flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>Last seen {new Date(d.last_seen_at).toLocaleTimeString()}</span>
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => setSelectedCandidate(d)}
                className="w-full inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <CheckCircle className="h-3.5 w-3.5 stroke-current fill-none" aria-hidden="true" />
                <span>Approve Device</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {selectedCandidate && (
        <DeviceApprovalModal
          branchId={branchId}
          candidate={selectedCandidate}
          isOpen={true}
          onClose={() => setSelectedCandidate(null)}
          onApproved={onRefresh}
        />
      )}
    </section>
  );
}
