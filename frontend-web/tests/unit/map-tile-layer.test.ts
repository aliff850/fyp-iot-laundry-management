import { describe, expect, it, vi } from "vitest";
import {
  attachResilientOsmTileLayer,
  FALLBACK_OSM_TILE_URL,
  PRIMARY_OSM_TILE_URL,
} from "@/lib/maps/tileLayer";

type HandlerMap = Record<string, Array<() => void>>;

function createMockLeaflet() {
  const createdLayers: Array<{
    url: string;
    options: Record<string, unknown>;
    handlers: HandlerMap;
    addTo: ReturnType<typeof vi.fn>;
    emit: (event: string) => void;
  }> = [];

  const mockL = {
    tileLayer: vi.fn((url: string, options: Record<string, unknown>) => {
      const handlers: HandlerMap = {};
      const layer = {
        url,
        options,
        handlers,
        on: vi.fn((event: string, fn: () => void) => {
          handlers[event] = handlers[event] ?? [];
          handlers[event].push(fn);
          return layer;
        }),
        addTo: vi.fn(() => layer),
        emit(event: string) {
          for (const fn of handlers[event] ?? []) fn();
        },
      };
      createdLayers.push(layer);
      return layer;
    }),
  };

  const mockMap = {
    removeLayer: vi.fn(),
  };

  return { mockL, mockMap, createdLayers };
}

describe("attachResilientOsmTileLayer", () => {
  it("uses standard tile.openstreetmap.org as primary layer (never tile.openstreetmap.fr/hot)", () => {
    const { mockL, mockMap, createdLayers } = createMockLeaflet();

    attachResilientOsmTileLayer(
      mockL as unknown as typeof import("leaflet"),
      mockMap as unknown as import("leaflet").Map,
    );

    expect(createdLayers).toHaveLength(1);
    expect(createdLayers[0].url).toBe(PRIMARY_OSM_TILE_URL);
    expect(createdLayers[0].url).not.toContain("openstreetmap.fr");
    expect(createdLayers[0].addTo).toHaveBeenCalledWith(mockMap);
  });

  it("falls back to CARTO Voyager after 3 consecutive tileerror events with zero successful loads", () => {
    const { mockL, mockMap, createdLayers } = createMockLeaflet();

    attachResilientOsmTileLayer(
      mockL as unknown as typeof import("leaflet"),
      mockMap as unknown as import("leaflet").Map,
    );

    const primary = createdLayers[0];
    primary.emit("tileerror");
    primary.emit("tileerror");
    expect(createdLayers).toHaveLength(1);

    primary.emit("tileerror");
    expect(mockMap.removeLayer).toHaveBeenCalledWith(primary);
    expect(createdLayers).toHaveLength(2);
    expect(createdLayers[1].url).toBe(FALLBACK_OSM_TILE_URL);
    expect(createdLayers[1].addTo).toHaveBeenCalledWith(mockMap);
  });

  it("does not switch to fallback once any primary tile has loaded successfully", () => {
    const { mockL, mockMap, createdLayers } = createMockLeaflet();

    attachResilientOsmTileLayer(
      mockL as unknown as typeof import("leaflet"),
      mockMap as unknown as import("leaflet").Map,
    );

    const primary = createdLayers[0];
    primary.emit("tileload");
    primary.emit("tileerror");
    primary.emit("tileerror");
    primary.emit("tileerror");

    expect(mockMap.removeLayer).not.toHaveBeenCalled();
    expect(createdLayers).toHaveLength(1);
  });
});
