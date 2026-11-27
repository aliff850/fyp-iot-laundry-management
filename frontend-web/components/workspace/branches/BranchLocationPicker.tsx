"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { Loader2, MapPin, Search, X } from "lucide-react";
import {
  lookupBranchAddressAction,
  type GeocodeActionResult,
} from "@/app/branches/actions";
import type { GeocodeResult } from "@/lib/auth/business";
import { attachResilientOsmTileLayer } from "@/lib/maps/tileLayer";

const MALAYSIA_CENTER: [number, number] = [4.2105, 101.9758];
const MALAYSIA_DEFAULT_ZOOM = 6;
const DEBOUNCE_MS = 400;

const REGION_PRESETS: { label: string; coords: [number, number]; zoom: number }[] = [
  { label: "KL / Selangor", coords: [3.139, 101.6869], zoom: 11 },
  { label: "Penang", coords: [5.4141, 100.3288], zoom: 11 },
  { label: "Johor Bahru", coords: [1.4927, 103.7414], zoom: 11 },
  { label: "Sabah / Sarawak", coords: [4.5, 114.5], zoom: 7 },
  { label: "All Malaysia", coords: MALAYSIA_CENTER, zoom: MALAYSIA_DEFAULT_ZOOM },
];

export interface BranchLocationPickerProps {
  latitude: string;
  longitude: string;
  onChange: (lat: string, lng: string) => void;
  allowAddressSearch?: boolean;
  addressContext?: string;
  onLookupAddress?: (query: string) => Promise<GeocodeActionResult>;
}

export function BranchLocationPicker({
  latitude,
  longitude,
  onChange,
  allowAddressSearch = false,
  addressContext = "",
  onLookupAddress = lookupBranchAddressAction,
}: BranchLocationPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markerInstance = useRef<LeafletMarker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GeocodeResult[] | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);

  const hasCoords = Boolean(latitude && longitude);
  const latNum = hasCoords ? parseFloat(latitude) : null;
  const lngNum = hasCoords ? parseFloat(longitude) : null;

  const clearPendingDebounce = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearPendingDebounce();
  }, [clearPendingDebounce]);

  function placeOrMoveMarker(L: typeof import("leaflet"), map: LeafletMap, lat: number, lng: number) {
    if (markerInstance.current) {
      markerInstance.current.setLatLng([lat, lng]);
      return;
    }
    const pin = document.createElement("span");
    pin.className =
      "block size-5 rounded-full border-2 border-ink bg-accent shadow-md cursor-grab active:cursor-grabbing";
    const icon = L.divIcon({ html: pin, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
    const marker = L.marker([lat, lng], {
      icon,
      draggable: true,
    }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
    });
    markerInstance.current = marker;
  }

  useEffect(() => {
    if (!container.current) return;
    let cancelled = false;

    async function mount() {
      const L = await import("leaflet");
      if (cancelled || !container.current) return;
      leafletRef.current = L;

      const initialCenter: [number, number] =
        latNum !== null && lngNum !== null && Number.isFinite(latNum) && Number.isFinite(lngNum)
          ? [latNum, lngNum]
          : MALAYSIA_CENTER;

      const initialZoom = latNum !== null && lngNum !== null ? 14 : MALAYSIA_DEFAULT_ZOOM;

      const map = L.map(container.current, { scrollWheelZoom: false }).setView(
        initialCenter,
        initialZoom,
      );
      mapInstance.current = map;

      attachResilientOsmTileLayer(L, map);

      if (latNum !== null && lngNum !== null && Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        placeOrMoveMarker(L, map, latNum, lngNum);
      }

      map.on("click", (e) => {
        placeOrMoveMarker(L, map, e.latlng.lat, e.latlng.lng);
        onChangeRef.current(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
      });
    }

    void mount();

    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
      markerInstance.current = null;
      leafletRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronize external coordinate changes (e.g., selecting an address search result)
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstance.current;
    if (!L || !map) return;

    if (latNum !== null && lngNum !== null && Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      const current = markerInstance.current?.getLatLng();
      const moved =
        !current ||
        Math.abs(current.lat - latNum) > 0.000001 ||
        Math.abs(current.lng - lngNum) > 0.000001;
      if (moved) {
        placeOrMoveMarker(L, map, latNum, lngNum);
        map.setView([latNum, lngNum], Math.max(map.getZoom(), 15), { animate: true });
      }
    } else if (markerInstance.current) {
      map.removeLayer(markerInstance.current);
      markerInstance.current = null;
    }
  }, [latNum, lngNum]);

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

  const runAddressSearch = useCallback(
    async (rawQuery: string, { showShortError = false } = {}) => {
      const cleaned = rawQuery.replace(/\s+/g, " ").trim();
      if (cleaned.length < 3 || cleaned.includes("@")) {
        requestSeqRef.current += 1;
        setSearching(false);
        setSearchResults(null);
        if (cleaned.includes("@")) {
          setSearchError("Enter a public street or landmark without email identifiers.");
        } else if (showShortError) {
          setSearchError("Enter at least 3 characters of a public street, landmark, or city.");
        } else {
          setSearchError(null);
        }
        return;
      }

      const seq = ++requestSeqRef.current;
      setSearching(true);
      setSearchError(null);
      try {
        const res = await onLookupAddress(cleaned);
        if (seq !== requestSeqRef.current) return;
        if (!res.ok) {
          setSearchResults(null);
          setAttribution(null);
          setSearchError(
            res.message || "Address search is unavailable. Click the map to drop a pin manually.",
          );
          return;
        }
        setSearchResults(res.results ?? []);
        setAttribution(
          res.attribution ?? "Address suggestions (c) OpenStreetMap contributors via Photon",
        );
      } catch {
        if (seq !== requestSeqRef.current) return;
        setSearchResults(null);
        setAttribution(null);
        setSearchError("Address search is unavailable. Click the map to drop a pin manually.");
      } finally {
        if (seq === requestSeqRef.current) {
          setSearching(false);
        }
      }
    },
    [onLookupAddress],
  );

  function handleSearchInputChange(nextValue: string) {
    setSearchQuery(nextValue);
    clearPendingDebounce();

    const cleaned = nextValue.replace(/\s+/g, " ").trim();
    if (cleaned.length < 3) {
      requestSeqRef.current += 1;
      setSearching(false);
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      void runAddressSearch(cleaned);
    }, DEBOUNCE_MS);
  }

  function handleDismissSearchResults() {
    clearPendingDebounce();
    requestSeqRef.current += 1;
    setSearching(false);
    setSearchResults(null);
  }

  function handleSelectResult(item: GeocodeResult) {
    clearPendingDebounce();
    requestSeqRef.current += 1;
    const nextLat = item.latitude.toFixed(6);
    const nextLng = item.longitude.toFixed(6);
    if (leafletRef.current && mapInstance.current) {
      placeOrMoveMarker(leafletRef.current, mapInstance.current, item.latitude, item.longitude);
      mapInstance.current.setView([item.latitude, item.longitude], 16, { animate: true });
    }
    onChange(nextLat, nextLng);
    setSearchResults(null);
    setSearchError(null);
    setSearching(false);
  }

  const trimmedContext = addressContext.replace(/\s+/g, " ").trim();

  return (
    <div className="space-y-3">
      {allowAddressSearch && (
        <div className="space-y-2 rounded-md border border-line bg-raised/40 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="branch-address-search" className="sr-only">
              Search map pin address
            </label>
            <div className="relative flex-1">
              <input
                id="branch-address-search"
                type="search"
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    handleDismissSearchResults();
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    clearPendingDebounce();
                    void runAddressSearch(searchQuery, { showShortError: true });
                  }
                }}
                placeholder="Type street, landmark, or city to drop pin (e.g., Jalan Universiti, Shah Alam)"
                className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 pr-10 text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              {searching && (
                <Loader2
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-accent"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {trimmedContext.length >= 3 && (
                <button
                  type="button"
                  onClick={() => {
                    clearPendingDebounce();
                    setSearchQuery(trimmedContext);
                    void runAddressSearch(trimmedContext, { showShortError: true });
                  }}
                  disabled={searching}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-surface px-3 text-xs font-medium text-muted hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  Use branch address
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  clearPendingDebounce();
                  void runAddressSearch(searchQuery, { showShortError: true });
                }}
                disabled={searching}
                aria-busy={searching}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/15 px-4 text-xs font-semibold text-ink hover:bg-accent/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 sm:text-sm"
              >
                <Search className="size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{searching ? "Searching…" : "Search"}</span>
              </button>
            </div>
          </div>

          {searchError && (
            <p role="alert" className="text-xs text-warning">
              {searchError} Manual pin placement remains available below.
            </p>
          )}

          {searchResults !== null && searchResults.length === 0 && !searchError && (
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>
                No matching public locations found. Click on the map below to place the pin manually.
              </span>
              <button
                type="button"
                onClick={handleDismissSearchResults}
                aria-label="Dismiss map search notice"
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded text-muted hover:text-ink"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {searchResults && searchResults.length > 0 && (
            <div className="space-y-1.5" role="listbox" aria-label="Address search results">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-muted">
                  Tap a result to move the map pin
                </span>
                <button
                  type="button"
                  onClick={handleDismissSearchResults}
                  className="inline-flex min-h-9 items-center gap-1 rounded px-2 text-xs text-muted hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  <span>Close</span>
                </button>
              </div>
              {searchResults.map((item, idx) => (
                <button
                  key={`${item.latitude}-${item.longitude}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => handleSelectResult(item)}
                  className="flex min-h-11 w-full flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-accent/50 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0 text-xs font-medium text-ink break-words">
                    {item.display_name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                  </span>
                </button>
              ))}
              {attribution && (
                <p className="pt-1 text-xs text-faint">{attribution}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <MapPin className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>Click on map or drag pin to position branch location</span>
        </div>

        {hasCoords && (
          <button
            type="button"
            onClick={handleClearPin}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-control bg-raised px-3 text-xs font-medium text-muted hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Clear pin</span>
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
          {REGION_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleJumpToPreset(preset.coords, preset.zoom)}
              className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface px-2.5 text-xs text-muted hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hasCoords ? (
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line bg-navy px-2.5 py-1 text-xs tabular-nums text-ink">
              <span className="text-positive font-semibold" aria-hidden="true">PIN</span>
              <span>
                {latitude}, {longitude}
              </span>
            </span>
          ) : (
            <span className="text-xs text-faint">No coordinates pinned (optional)</span>
          )}
        </div>
      </div>
    </div>
  );
}
