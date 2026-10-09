"use client";

import React from "react";
import {
  LayoutDashboard,
  WashingMachine,
  Sliders,
  Flame,
  BarChart3,
  ShieldAlert,
} from "lucide-react";

export type NavTab = "overview" | "fleet" | "lpg" | "safety" | "parameters" | "telemetry";

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
    { id: "lpg", label: "LPG & Safety", icon: <Flame className="w-4 h-4 text-orange-600" /> },
    { id: "safety", label: "Environmental Safety", icon: <ShieldAlert className="w-4 h-4 text-emerald-600" /> },
    { id: "telemetry", label: "Telemetry & Revenue", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 shrink-0 hidden md:block">
      <div className="p-4 space-y-4">
        <div>
          <div className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-slate-500">
            Navigation
          </div>
          <nav className="mt-1 space-y-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors rounded-r-lg ${
                    isActive
                      ? "border-l-4 border-msu bg-msu-light text-msu font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={isActive ? "text-msu" : "text-slate-400"}>
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                        isActive ? "bg-msu/10 text-msu" : "bg-slate-100 text-slate-600"
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

        {/* Quick System Status Card */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">Gateway</span>
            <span className="text-green-700 font-semibold inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Online
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">LPG Bus</span>
            <span className="text-slate-800 font-medium">HX711 Array</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">Sensors</span>
            <span className="text-slate-800 font-medium">MQ-6 + DHT22</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
