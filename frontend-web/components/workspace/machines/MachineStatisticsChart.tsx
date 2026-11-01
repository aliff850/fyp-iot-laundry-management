"use client";

import React, { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";

export interface ChartDataset {
  label: string;
  data: number[];
  color: string;
  fill?: boolean;
  backgroundColor?: string;
  borderColor?: string;
}

export interface MachineStatisticsChartProps {
  title: string;
  subtitle?: string;
  unit: string;
  type?: "line" | "bar";
  labels: string[];
  datasets: ChartDataset[];
  height?: number;
  footerNote?: string;
  ariaLabel?: string;
}

export function MachineStatisticsChart({
  title,
  subtitle,
  unit,
  type = "line",
  labels,
  datasets,
  height = 200,
  footerNote,
  ariaLabel,
}: MachineStatisticsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Safely destroy existing chart instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const chartDatasets = datasets.map(ds => {
      const isBar = type === "bar";
      const bg =
        ds.backgroundColor ??
        (isBar
          ? ds.color
          : ds.fill
          ? `${ds.color}20` // 12% opacity tint for area fill
          : "transparent");

      return {
        label: ds.label,
        data: ds.data,
        borderColor: ds.borderColor ?? ds.color,
        backgroundColor: bg,
        borderWidth: isBar ? 0 : 2.5,
        tension: 0.35,
        fill: ds.fill ?? false,
        borderRadius: isBar ? 4 : 0,
        pointBackgroundColor: ds.color,
        pointBorderColor: "#131217",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });

    const config: ChartConfiguration<"line" | "bar"> = {
      type,
      data: {
        labels,
        datasets: chartDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: "top",
            align: "end",
            labels: {
              color: "#b4b4ba",
              boxWidth: 10,
              boxHeight: 10,
              padding: 12,
              font: {
                family: "ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
            },
          },
          tooltip: {
            enabled: true,
            backgroundColor: "#131217",
            borderColor: "#2c2b30",
            borderWidth: 1,
            titleColor: "#f2f2f3",
            bodyColor: "#b4b4ba",
            padding: 10,
            cornerRadius: 4,
            callbacks: {
              label: context => {
                const val = context.parsed.y;
                if (val === null || val === undefined) {
                  return `${context.dataset.label}: —`;
                }
                if (unit === "MYR") {
                  return `${context.dataset.label}: RM ${val.toFixed(2)}`;
                }
                return `${context.dataset.label}: ${val} ${unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "#242328",
              tickColor: "#2c2b30",
            },
            ticks: {
              color: "#94949d",
              font: {
                family: "ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "#242328",
              tickColor: "#2c2b30",
            },
            ticks: {
              color: "#94949d",
              font: {
                family: "ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
              callback: value => {
                if (unit === "MYR") return `RM ${value}`;
                return `${value}`;
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
  }, [type, labels, datasets, unit]);

  return (
    <div className="rounded-md border border-line bg-surface p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <h3 className="text-xs font-semibold text-ink">{title}</h3>
        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
      </div>

      {/* Chart Canvas Container */}
      <div className="relative w-full overflow-hidden" style={{ height: `${height}px` }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel || `${title} visualization`}
        />
        {/* Screen Reader Data Table Fallback */}
        <div className="sr-only">
          <p>{title}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {datasets.map(ds => (
                  <th key={ds.label}>{ds.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((lbl, idx) => (
                <tr key={lbl}>
                  <td>{lbl}</td>
                  {datasets.map(ds => (
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

      {/* Optional Contextual Footnote */}
      {footerNote && (
        <p className="text-[11px] text-muted border-t border-rule/60 pt-2.5">
          {footerNote}
        </p>
      )}
    </div>
  );
}

