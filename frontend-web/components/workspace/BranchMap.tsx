"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { WorkspaceBranch } from "@/lib/auth/business";

export function BranchMap({ branches, selectedId, onSelect }: { branches: WorkspaceBranch[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const located = useMemo(() => branches.filter(b => b.latitude !== null && b.longitude !== null), [branches]);

  useEffect(() => {
    if (!container.current || located.length === 0) return;
    let cancelled = false;
    async function mount() {
      const L = await import("leaflet");
      if (cancelled || !container.current) return;
      const instance = L.map(container.current, { scrollWheelZoom: false });
      map.current = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(instance);
      const points = located.map(b => {
        const point = L.latLng(b.latitude!, b.longitude!);
        const pin = document.createElement("span");
        pin.className = "block size-4 rounded-full border-2 border-ink bg-accent shadow-sm";
        const popup = document.createElement("span");
        popup.textContent = b.name;
        L.marker(point, { icon: L.divIcon({ html: pin, className: "", iconSize: [16, 16] }) })
          .bindPopup(popup).on("click", () => onSelect(b.id)).addTo(instance);
        return point;
      });
      instance.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
    }
    void mount();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, [located, onSelect]);

  useEffect(() => {
    const branch = located.find(b => b.id === selectedId);
    if (branch && branch.latitude !== null && branch.longitude !== null) map.current?.setView([branch.latitude, branch.longitude], 15);
  }, [located, selectedId]);

  function select(branch: WorkspaceBranch) {
    onSelect(branch.id);
    if (branch.latitude !== null && branch.longitude !== null) map.current?.setView([branch.latitude, branch.longitude], 15);
  }

  return <section className="rounded-md border border-line bg-surface px-5 py-4 md:p-7" aria-labelledby="branch-map-title">
    <h3 id="branch-map-title" className="text-base font-semibold">Map</h3>
    <p className="mt-1 text-xs text-muted">Locations with confirmed coordinates · online OpenStreetMap tiles</p>
    {located.length ? <div ref={container} role="application" aria-label="Branch locations on OpenStreetMap" className="mt-5 h-80 w-full rounded-md border border-line" /> : <div className="mt-5 rounded-md border border-line bg-raised p-5 text-sm text-muted">No branch coordinates have been set. The list remains available.</div>}
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Select a mapped branch">{located.map(branch => <button key={branch.id} type="button" onClick={() => select(branch)} aria-pressed={selectedId === branch.id} className="min-h-11 rounded-md border border-control bg-navy px-3 py-2 text-xs text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:bg-navy-selected">{branch.name}</button>)}</div>
    {selectedId && <p className="mt-3 text-xs text-muted">Selected: {branches.find(b => b.id === selectedId)?.name}</p>}
  </section>;
}
