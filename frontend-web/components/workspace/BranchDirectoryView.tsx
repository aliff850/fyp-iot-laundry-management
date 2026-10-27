"use client";

import { useState } from "react";
import { BranchMap } from "@/components/workspace/BranchMap";
import type { WorkspaceBranch } from "@/lib/auth/business";

export function BranchDirectoryView({ branches }: { branches: WorkspaceBranch[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-6">
    <section className="rounded-md border border-line bg-surface px-5 py-4 md:p-7" aria-labelledby="locations-title">
      <h3 id="locations-title" className="text-base font-semibold">Locations</h3><p className="mt-1 text-xs text-muted">{branches.length} locations available</p>
      <ul className="mt-5 divide-y divide-rule">{branches.map(branch => <li key={branch.id} className="py-3 first:pt-0 last:pb-0">
        <button type="button" onClick={() => setSelectedId(branch.id)} aria-pressed={selectedId === branch.id} className="w-full rounded-md px-2 py-2 text-left hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:bg-navy">
          <span className="flex flex-wrap items-start justify-between gap-2"><span><span className="block text-sm font-semibold">{branch.name}</span><span className="mt-1 block text-xs text-muted">{branch.address}, {branch.city}, {branch.region} {branch.postal_code}</span></span><span className="rounded-sm border border-line px-2 py-1 text-xs text-muted">{branch.service_status === "open" ? "Open to customers" : "Closed to customers"}</span></span>
          <span className="mt-3 block text-xs text-faint">{branch.latitude === null ? "Map location not set" : "Map location available"} · Machine and sensor status unavailable</span>
        </button>
      </li>)}</ul>
    </section>
    <BranchMap branches={branches} selectedId={selectedId} onSelect={setSelectedId} />
  </div>;
}
