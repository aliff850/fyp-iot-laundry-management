"use client";

import React, { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";

export type ChartTokenName =
  | "accent"
  | "positive"
  | "warning"
  | "navy-selected"
  | "muted"
  | "control";

export interface ChartDataset {
  label: string;
  data: number[];
  token?: ChartTokenName;
  color?: string;
  fill?: boolean;
  backgroundColor?: string;
  borderColor?: string;
}

export interface MachineStatisticsChartProps {
  title: string;
  subtitle?: string;
  unit: string;
  type?: "line" | "bar";
  stacked?: boolean;
  showLegend?: boolean;
  precision?: number;
  labels: string[];
  datasets: ChartDataset[];
  height?: number;
  footerNote?: string;
  ariaLabel?: string;
}

const TOKEN_FALLBACKS: Record<string, string> = {
  accent: "#ef6268",
  positive: "#79c5a6",
  warning: "#dfb463",
  "navy-selected": "#223d5b",
  muted: "#b4b4ba",
  control: "#8c8a93",
  ink: "#f2f2f3",
  line: "#2c2b30",
  surface: "#131217",
};

function resolveThemeColor(token: string): string {
  if (typeof window !== "undefined") {
    const val = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-${token}`)
      .trim();
    if (val) return val;
  }
  return TOKEN_FALLBACKS[token] ?? "#f2f2f3";
}

export function MachineStatisticsChart({
  title,
  subtitle,
  unit,
  type = "line",
  stacked = false,
  showLegend,
  precision,
  labels,
  datasets,
  footerNote = "Exact values are available in the table below.",
  ariaLabel,
}: MachineStatisticsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const inkColor = resolveThemeColor("ink");
    const mutedColor = resolveThemeColor("muted");
    const lineColor = resolveThemeColor("line");
    const surfaceColor = resolveThemeColor("surface");

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const isBar = type === "bar";

    const chartDatasets = datasets.map((ds) => {
      const resolvedColor =
        ds.color ?? (ds.token ? resolveThemeColor(ds.token) : resolveThemeColor("accent"));
      const bg =
        ds.backgroundColor ??
        (isBar ? resolvedColor : ds.fill ? `${resolvedColor}20` : resolvedColor);

      return {
        label: ds.label,
        data: ds.data,
        borderColor: ds.borderColor ?? resolvedColor,
        backgroundColor: bg,
        borderWidth: isBar ? 0 : 2,
        tension: 0.2,
        fill: ds.fill ?? false,
        borderRadius: isBar ? 3 : 0,
        pointRadius: isBar ? 0 : 4,
        pointHoverRadius: isBar ? 0 : 6,
      };
    });

    const displayLegend = showLegend ?? (isBar || datasets.length > 1);

    const config: ChartConfiguration<"line" | "bar"> = {
      type,
      data: {
        labels,
        datasets: chartDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduceMotion ? false : { duration: 250 },
        scales: {
          x: {
            stacked: isBar && stacked,
            ticks: {
              color: mutedColor,
              maxRotation: 0,
              font: {
                family: "Manrope, ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
            },
            grid: {
              display: false,
            },
          },
          y: {
            stacked: isBar && stacked,
            beginAtZero: true,
            ticks: {
              color: mutedColor,
              precision: precision ?? (isBar ? 0 : 1),
              font: {
                family: "Manrope, ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
              callback: (value) => {
                if (unit === "MYR") return `RM ${value}`;
                return `${value}`;
              },
            },
            grid: {
              color: lineColor,
            },
          },
        },
        plugins: {
          legend: {
            display: displayLegend,
            labels: {
              color: inkColor,
              font: {
                family: "Manrope, ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
            },
          },
          tooltip: {
            enabled: true,
            backgroundColor: surfaceColor,
            borderColor: lineColor,
            borderWidth: 1,
            titleColor: inkColor,
            bodyColor: mutedColor,
            padding: 10,
            cornerRadius: 4,
            callbacks: {
              label: (context) => {
                const val = context.parsed.y;
                if (val === null || val === undefined) {
                  return `${context.dataset.label}: —`;
                }
                if (unit === "MYR") {
                  return `${context.dataset.label}: RM ${val.toFixed(2)}`;
                }
                if (unit === "min") {
                  return `${context.dataset.label}: ${val.toFixed(1)} min`;
                }
                return `${context.dataset.label}: ${val}${unit ? ` ${unit}` : ""}`;
              },
            },
          },
        },
      },
    };

    chartInstanceRef.current = new Chart(canvas, config);

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [type, stacked, showLegend, precision, labels, datasets, unit]);

  return (
    <figure className="space-y-4 rounded-md border border-rule bg-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
      </div>

      <div className="relative h-56 w-full sm:h-64">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          role="img"
          aria-label={ariaLabel || `${title} visualization`}
        />
        <div className="sr-only">
          <p>{title}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {datasets.map((ds) => (
                  <th key={ds.label}>{ds.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((lbl, idx) => (
                <tr key={lbl}>
                  <td>{lbl}</td>
                  {datasets.map((ds) => (
                    <td key={ds.label}>
                      {ds.data[idx]} {unit}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {footerNote && <figcaption className="text-xs text-muted">{footerNote}</figcaption>}
    </figure>
  );
}
