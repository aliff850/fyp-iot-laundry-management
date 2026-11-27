import type { Map as LeafletMap, TileLayer } from "leaflet";

export const PRIMARY_OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const PRIMARY_OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export const FALLBACK_OSM_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
export const FALLBACK_OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

const FALLBACK_ERROR_THRESHOLD = 3;

export function attachResilientOsmTileLayer(
  L: typeof import("leaflet"),
  map: LeafletMap,
): TileLayer {
  let loadedAnyTile = false;
  let errorCount = 0;
  let switchedToFallback = false;

  const primary = L.tileLayer(PRIMARY_OSM_TILE_URL, {
    attribution: PRIMARY_OSM_ATTRIBUTION,
    maxZoom: 19,
    referrerPolicy: "strict-origin-when-cross-origin",
  });

  primary.on("tileload", () => {
    loadedAnyTile = true;
  });

  primary.on("tileerror", () => {
    if (loadedAnyTile || switchedToFallback) return;
    errorCount += 1;
    if (errorCount < FALLBACK_ERROR_THRESHOLD) return;
    switchedToFallback = true;
    map.removeLayer(primary);
    L.tileLayer(FALLBACK_OSM_TILE_URL, {
      attribution: FALLBACK_OSM_ATTRIBUTION,
      subdomains: "abcd",
      maxZoom: 19,
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(map);
  });

  primary.addTo(map);
  return primary;
}
