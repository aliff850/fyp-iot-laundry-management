"use client";

import React, { useState } from "react";
import { Branch } from "@/types";
import { Navigation, ExternalLink, MapPin } from "lucide-react";

interface GoogleBranchMapProps {
  branches: Branch[];
  selectedBranchId?: string;
  onSelectBranch: (branchId: string) => void;
}

export function GoogleBranchMap({ branches, selectedBranchId, onSelectBranch }: GoogleBranchMapProps) {
  const [activeBranchId, setActiveBranchId] = useState<string>(
    selectedBranchId || branches[0]?.id || "msu-shah-alam"
  );

  const activeBranch = branches.find((b) => b.id === activeBranchId) || branches[0];
  const lat = activeBranch?.lat ?? 3.0565;
  const lng = activeBranch?.lng ?? 101.5540;

  const handleBranchClick = (id: string) => {
    setActiveBranchId(id);
    onSelectBranch(id);
  };

  const isCritical = activeBranch?.health_status === "CRITICAL";
  const isWarning = activeBranch?.health_status === "WARNING";

  const googleMapsEmbedUrl = `https://www.google.com/maps?q=${lat},${lng}&hl=en&z=16&output=embed`;
  const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-msu-light text-msu flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-800 leading-tight truncate">
              Facility Map Locator
            </h3>
            <p className="text-xs text-slate-500 font-medium truncate">
              Registered campus laundry facilities
            </p>
          </div>
        </div>

        {/* Branch Selector Tabs on the Map */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 text-xs font-semibold">
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() => handleBranchClick(b.id)}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                activeBranchId === b.id
                  ? "bg-msu text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <MapPin className="w-3 h-3" />
              <span className="truncate">{b.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Map + Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Google Maps Embed */}
        <div className="lg:col-span-2 relative h-72 sm:h-80 md:h-[380px] bg-slate-100">
          <iframe
            title={`Google Map - ${activeBranch?.name || "Branch Location"}`}
            src={googleMapsEmbedUrl}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen={false}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="w-full h-full"
          />
        </div>

        {/* Selected Branch Details Side Card */}
        <div className="p-4 border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col justify-between bg-white space-y-3.5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-msu bg-msu-light px-2.5 py-0.5 rounded-full">
                {activeBranch?.campus_type || "Campus Outlet"}
              </span>

              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isCritical
                    ? "bg-red-100 text-red-700 animate-pulse"
                    : isWarning
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {isCritical ? "Critical" : isWarning ? "Warning" : "Nominal"}
              </span>
            </div>

            <div>
              <h4 className="text-base font-semibold text-slate-900 leading-tight">
                {activeBranch?.name}
              </h4>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {activeBranch?.address}, {activeBranch?.city}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-600">
                <span>Coordinates:</span>
                <span className="font-semibold text-slate-900">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Operating Hours:</span>
                <span className="font-semibold text-slate-900">{activeBranch?.opening_hours || "24 Hours"}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Phone:</span>
                <span className="font-semibold text-slate-900">{activeBranch?.contact_phone || "+60 3-5521 2888"}</span>
              </div>
            </div>

            {/* Quick Fleet Summary */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-medium">Washers</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {activeBranch?.active_washers ?? 2}/{activeBranch?.total_washers ?? 4} In-Use
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-xs text-slate-500 uppercase tracking-wider block font-medium">Dryers</span>
                <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                  {activeBranch?.active_dryers ?? 2}/{activeBranch?.total_dryers ?? 4} In-Use
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <a
              href={googleMapsDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Get Directions</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
