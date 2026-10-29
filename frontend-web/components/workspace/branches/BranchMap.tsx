"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { WorkspaceBranch } from "@/lib/auth/business";

const MALAYSIA_CENTER: [number, number] = [4.2105, 101.9758];
const MALAYSIA_DEFAULT_ZOOM = 6;

export function BranchMap({ branches, selectedId, onSelect }: { branches: WorkspaceBranch[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const located = useMemo(() => branches.filter(b => b.latitude !== null && b.longitude !== null), [branches]);

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;

    async function mount() {
      const L = await import("leaflet");
      if (cancelled || !container.current) return;

      const instance = L.map(container.current, { scrollWheelZoom: false });
      map.current = instance;

      L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noreferrer">Humanitarian OpenStreetMap Team</a>',
        subdomains: "abc",
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
      }).addTo(instance);

      if (located.length > 0) {
        const points = located.map(b => {
          const point = L.latLng(b.latitude!, b.longitude!);
          const pin = document.createElement("span");
          pin.className = "block size-4 rounded-full border-2 border-ink bg-accent shadow-sm";
          const popup = document.createElement("div");
          popup.className = "text-xs font-sans text-surface";
          popup.innerHTML = `<strong>${b.name}</strong><br/>${b.city}, ${b.region}`;
          L.marker(point, { icon: L.divIcon({ html: pin, className: "", iconSize: [16, 16] }) })
            .bindPopup(popup)
            .on("click", () => onSelect(b.id))
            .addTo(instance);
          return point;
        });
        instance.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
      } else {
        instance.setView(MALAYSIA_CENTER, MALAYSIA_DEFAULT_ZOOM);
      }
    }

    void mount();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [located, onSelect]);

  useEffect(() => {
    if (!selectedId) return;
    const branch = located.find(b => b.id === selectedId);
    if (branch && branch.latitude !== null && branch.longitude !== null) {
      map.current?.setView([branch.latitude, branch.longitude], 15, { animate: true });
    }
  }, [located, selectedId]);

  function select(branch: WorkspaceBranch) {
    onSelect(branch.id);
    if (branch.latitude !== null && branch.longitude !== null) {
      map.current?.setView([branch.latitude, branch.longitude], 15, { animate: true });
    }
  }

  function resetView() {
    onSelect(null);
    if (!map.current) return;
    import("leaflet").then(L => {
      if (located.length > 0) {
        const points = located.map(b => L.latLng(b.latitude!, b.longitude!));
        map.current?.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
      } else {
        map.current?.setView(MALAYSIA_CENTER, MALAYSIA_DEFAULT_ZOOM);
      }
    });
  }

  return (
    <section className="relative z-0 isolate flex h-full flex-col rounded-md border border-line bg-surface px-5 py-4 md:p-6" aria-labelledby="branch-map-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="branch-map-title" className="text-base font-semibold">Location Map</h3>
          <p className="mt-0.5 text-xs text-muted">
            {located.length > 0
              ? `${located.length} of ${branches.length} locations mapped · OpenStreetMap`
              : "Malaysia overview · OpenStreetMap"}
          </p>
        </div>
        {located.length > 0 && (
          <button
            type="button"
            onClick={resetView}
            className="inline-flex min-h-9 items-center rounded border border-line bg-raised px-2.5 py-1 text-xs text-muted hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Fit all
          </button>
        )}
      </div>

      <div
        ref={container}
        role="application"
        aria-label="Branch locations on OpenStreetMap"
        className="relative z-0 isolate mt-4 h-96 w-full overflow-hidden rounded-md border border-line md:h-[480px]"
      />

      {located.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Select a mapped branch">
          <span className="text-xs text-faint">Jump to:</span>
          {located.map(branch => (
            <button
              key={branch.id}
              type="button"
              onClick={() => select(branch)}
              aria-pressed={selectedId === branch.id}
              className="inline-flex min-h-8 items-center rounded border border-line bg-navy px-2.5 py-1 text-xs text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-navy-selected"
            >
              {branch.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-faint">
          No branch coordinates pinned yet. Centered on Malaysia.
        </p>
      )}
    </section>
  );
}
