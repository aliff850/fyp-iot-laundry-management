"use client";

import React from "react";
import {
  LayoutDashboard,
  WashingMachine,
  Sliders,
  Flame,
  BarChart3,
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
    { id: "parameters", label: "Parameters", icon: <Sliders className="w-4 h-4" /> },
    { id: "safety", label: "LPG & Safety", icon: <Flame className="w-4 h-4" /> },
    { id: "telemetry", label: "Telemetry", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-60 bg-white border-r-2 border-slate-300 shrink-0 hidden md:block">
      <div className="p-4">
        <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 font-mono">
          Navigation
        </div>
        <nav className="mt-1 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? "bg-msu text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <span className={isActive ? "text-msu-gold" : "text-slate-400"}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700 border border-slate-200"
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
    </aside>
  );
}
