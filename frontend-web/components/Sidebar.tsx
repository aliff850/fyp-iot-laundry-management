"use client";

import React from "react";
import {
  LayoutDashboard,
  WashingMachine,
  Sliders,
  Flame,
  BarChart3,
  Layers,
} from "lucide-react";

export type NavTab = "overview" | "fleet" | "parameters" | "safety" | "telemetry";

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  runningCount: number;
  totalMachines: number;
}

export function Sidebar({
  activeTab,
  onTabChange,
  runningCount,
  totalMachines,
}: SidebarProps) {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: "fleet",
      label: "Machine Fleet",
      icon: <WashingMachine className="w-4 h-4" />,
      badge: `${runningCount}/${totalMachines}`,
    },
    { id: "parameters", label: "Parameter Control", icon: <Sliders className="w-4 h-4" /> },
    { id: "safety", label: "LPG & Safety", icon: <Flame className="w-4 h-4" /> },
    { id: "telemetry", label: "Telemetry & Revenue", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 shrink-0 hidden md:block">
      <div className="p-4">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Operator Console
        </div>
        <nav className="mt-2 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${isActive
                    ? "bg-msu-light text-msu font-semibold border-l-4 border-msu shadow-xs"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={isActive ? "text-msu" : "text-slate-400"}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${isActive ? "bg-msu text-white" : "bg-slate-100 text-slate-600"
                      }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* <div className="p-4 mx-4 mt-8 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
          <Layers className="w-3.5 h-3.5 text-msu" />
          <span>FYP Architecture</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Physical ESP32 node streaming MQ-6 & DHT22. Laundry machines in cloud simulation mode.
        </p>
      </div> */}
    </aside>
  );
}
