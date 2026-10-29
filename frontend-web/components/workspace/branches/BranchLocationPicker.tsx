"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { MapPin, RotateCcw, X } from "lucide-react";

const MALAYSIA_CENTER: [number, number] = [4.2105, 101.9758];
const MALAYSIA_DEFAULT_ZOOM = 6;

const REGION_PRESETS: { label: string; coords: [number, number]; zoom: number }[] = [
  { label: "KL / Selangor", coords: [3.139, 101.6869], zoom: 11 },
  { label: "Penang", coords: [5.4141, 100.3288], zoom: 11 },
  { label: "Johor Bahru", coords: [1.4927, 103.7414], zoom: 11 },
  { label: "Sabah / Sarawak", coords: [4.5, 114.5], zoom: 7 },
  { label: "All Malaysia", coords: MALAYSIA_CENTER, zoom: MALAYSIA_DEFAULT_ZOOM },
];

interface BranchLocationPickerProps {
  latitude: string;
  longitude: string;
  onChange: (lat: string, lng: string) => void;
}

export function BranchLocationPicker({ latitude, longitude, onChange }: BranchLocationPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markerInstance = useRef<LeafletMarker | null>(null);

  const hasCoords = Boolean(latitude && longitude);
  const latNum = hasCoords ? parseFloat(latitude) : null;
  const lngNum = hasCoords ? parseFloat(longitude) : null;

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;

    async function mount() {
      const L = await import("leaflet");
      if (cancelled || !container.current) return;

      const initialCenter: [number, number] =
        latNum !== null && lngNum !== null && Number.isFinite(latNum) && Number.isFinite(lngNum)
          ? [latNum, lngNum]
          : MALAYSIA_CENTER;

      const initialZoom = latNum !== null && lngNum !== null ? 14 : MALAYSIA_DEFAULT_ZOOM;

      const map = L.map(container.current, { scrollWheelZoom: false }).setView(
        initialCenter,
        initialZoom
      );
      mapInstance.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/" target="_blank" rel="noreferrer">Humanitarian OpenStreetMap Team</a>',
        subdomains: "abc",
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
      }).addTo(map);

      function createPinIcon() {
        const pin = document.createElement("span");
        pin.className =
          "block size-5 rounded-full border-2 border-ink bg-accent shadow-md cursor-grab active:cursor-grabbing";
        return L.divIcon({ html: pin, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
      }

      function updateMarker(lat: number, lng: number) {
        if (!mapInstance.current) return;
        const formattedLat = lat.toFixed(6);
        const formattedLng = lng.toFixed(6);

        if (markerInstance.current) {
          markerInstance.current.setLatLng([lat, lng]);
        } else {
          const marker = L.marker([lat, lng], {
            icon: createPinIcon(),
            draggable: true,
          }).addTo(mapInstance.current);

          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            onChange(pos.lat.toFixed(6), pos.lng.toFixed(6));
          });

          markerInstance.current = marker;
        }

        onChange(formattedLat, formattedLng);
      }

      if (latNum !== null && lngNum !== null && Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        const marker = L.marker([latNum, lngNum], {
          icon: createPinIcon(),
          draggable: true,
        }).addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onChange(pos.lat.toFixed(6), pos.lng.toFixed(6));
        });

        markerInstance.current = marker;
      }

      map.on("click", e => {
        updateMarker(e.latlng.lat, e.latlng.lng);
      });
    }

    void mount();

    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
      markerInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClearPin() {
    if (markerInstance.current && mapInstance.current) {
      mapInstance.current.removeLayer(markerInstance.current);
      markerInstance.current = null;
    }
    onChange("", "");
  }

  function handleJumpToPreset(coords: [number, number], zoom: number) {
    if (mapInstance.current) {
      mapInstance.current.setView(coords, zoom, { animate: true });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <MapPin className="size-4 text-accent" aria-hidden="true" />
          <span>Click on map or drag pin to position branch location</span>
        </div>

        {hasCoords && (
          <button
            type="button"
            onClick={handleClearPin}
            className="inline-flex min-h-8 items-center gap-1 rounded border border-control bg-raised px-2.5 py-1 text-xs text-muted hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear pin
          </button>
        )}
      </div>

      <div
        ref={container}
        role="application"
        aria-label="Interactive map for selecting branch coordinates"
        className="relative z-0 isolate h-80 w-full overflow-hidden rounded-md border border-line md:h-96"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-faint">Zoom to:</span>
          {REGION_PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleJumpToPreset(preset.coords, preset.zoom)}
              className="inline-flex min-h-7 items-center rounded border border-line bg-surface px-2 py-0.5 text-xs text-muted hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hasCoords ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-line bg-navy px-2.5 py-1 text-xs tabular-nums text-ink">
              <span className="size-2 rounded-full bg-positive" aria-hidden="true" />
              {latitude}, {longitude}
            </span>
          ) : (
            <span className="text-xs text-faint">No coordinates pinned (optional)</span>
          )}
        </div>
      </div>
    </div>
  );
}
