"use client";

import React, { useState } from "react";
import { X, Building2, MapPin, Phone, Clock, Network, CheckCircle2 } from "lucide-react";
import { createBranch } from "@/lib/api";
import { Branch } from "@/types";

interface AddBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBranchAdded: (branch: Branch) => void;
}

export function AddBranchModal({ isOpen, onClose, onBranchAdded }: AddBranchModalProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Shah Alam");
  const [state, setState] = useState("Selangor");
  const [postalCode, setPostalCode] = useState("40100");
  const [lat, setLat] = useState("3.0738");
  const [lng, setLng] = useState("101.5183");
  const [phone, setPhone] = useState("+60 3-5521 2888");
  const [hours, setHours] = useState("24 Hours (Daily)");
  const [gatewayIp, setGatewayIp] = useState("192.168.30.1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload: Partial<Branch> = {
      name,
      address,
      city,
      state,
      postal_code: postalCode,
      lat: parseFloat(lat) || 3.0565,
      lng: parseFloat(lng) || 101.5540,
      contact_phone: phone,
      opening_hours: hours,
      gateway_ip: gatewayIp,
    };

    const res = await createBranch(payload);
    setIsSubmitting(false);

    if (res.success && res.data) {
      onBranchAdded(res.data);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Header */}
        <div className="px-5 py-3.5 bg-msu text-white flex items-center justify-between border-b border-msu-dark">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-300" />
            <h3 className="text-base font-bold tracking-tight text-white">
              Onboard New Laundromat Branch
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-lg p-1 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[calc(85vh-100px)] overflow-y-auto">
          {/* Branch Title & Identification */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Branch Name & Title *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium"
              placeholder="e.g., MSU Subang Jaya Annex"
              required
            />
          </div>

          {/* Street Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Physical Street Address *
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium"
              placeholder="e.g., Ground Floor, Subang Square Commercial Centre, Jalan SS15/4G"
              required
            />
          </div>

          {/* City, State, Postal Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Postal Code
              </label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
                required
              />
            </div>
          </div>

          {/* Geographical Coordinates for GIS Map */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-msu" />
              <span>GIS Geographical Map Coordinates (Decimal Degrees)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Latitude (DD)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Longitude (DD)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
                  required
                />
              </div>
            </div>
          </div>

          {/* Emergency Phone & Hours */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" />
                Emergency Telephone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                Operating Hours
              </label>
              <input
                type="text"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium"
                required
              />
            </div>
          </div>

          {/* Edge Gateway Broker IP */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Network className="w-3.5 h-3.5 text-slate-400" />
              Initial Hardware Gateway IP Address
            </label>
            <input
              type="text"
              value={gatewayIp}
              onChange={(e) => setGatewayIp(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
              placeholder="e.g., 192.168.30.1"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-4 text-xs font-semibold text-white bg-msu hover:bg-msu-dark rounded-lg transition-all shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? "Registering..." : "+ Register Branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
