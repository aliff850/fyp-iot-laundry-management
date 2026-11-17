"use client";

import React, { useEffect, useRef } from "react";
import Chart, { type ChartConfiguration } from "chart.js/auto";

export interface ResolvedTheme {
  ink: string;
  muted: string;
  faint: string;
  line: string;
  rule: string;
  accent: string;
  positive: string;
  warning: string;
  negative: string;
  control: string;
  navySelected: string;
  reducedMotion: boolean;
}

const DEFAULT_THEME: ResolvedTheme = {
  ink: "#f2f2f3",
  muted: "#b4b4ba",
  faint: "#94949d",
  line: "#2c2b30",
  rule: "#242328",
  accent: "#ef6268",
  positive: "#79c5a6",
  warning: "#dfb463",
  negative: "#ef8798",
  control: "#8c8a93",
  navySelected: "#223d5b",
  reducedMotion: false,
};

export function readCssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
}

export function withHexAlpha(hex: string, alphaHex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return `${hex}${alphaHex}`;
  }
  return hex;
}

export function buildTheme(): ResolvedTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return {
    ink: readCssToken("--color-ink", DEFAULT_THEME.ink),
    muted: readCssToken("--color-muted", DEFAULT_THEME.muted),
    faint: readCssToken("--color-faint", DEFAULT_THEME.faint),
    line: readCssToken("--color-line", DEFAULT_THEME.line),
    rule: readCssToken("--color-rule", DEFAULT_THEME.rule),
    accent: readCssToken("--color-accent", DEFAULT_THEME.accent),
    positive: readCssToken("--color-positive", DEFAULT_THEME.positive),
    warning: readCssToken("--color-warning", DEFAULT_THEME.warning),
    negative: readCssToken("--color-negative", DEFAULT_THEME.negative),
    control: readCssToken("--color-control", DEFAULT_THEME.control),
    navySelected: readCssToken("--color-navy-selected", DEFAULT_THEME.navySelected),
    reducedMotion:
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
  };
}

/** Shared Chart.js canvas wrapper with CSS token theming and lifecycle cleanup. */
export function ChartCanvas({
  ariaLabel,
  buildConfig,
}: {
  ariaLabel: string;
  buildConfig: (theme: ResolvedTheme) => ChartConfiguration;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const theme = buildTheme();
    const config = buildConfig(theme);
    const chart = new Chart(canvas, config);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, [buildConfig]);

  return <canvas ref={canvasRef} role="img" aria-label={ariaLabel} className="size-full" />;
}
