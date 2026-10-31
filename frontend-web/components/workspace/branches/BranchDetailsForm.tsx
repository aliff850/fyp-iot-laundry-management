"use client";

import dynamic from "next/dynamic";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { BranchDetail, ManagerOption } from "@/lib/auth/business";
import {
  updateWorkspaceBranch,
  type UpdateBranchState,
} from "@/app/branches/[branchId]/details/actions";
import { deleteWorkspaceBranch } from "@/app/branches/actions";

const BranchLocationPicker = dynamic(
  () =>
    import("@/components/workspace/branches/BranchLocationPicker").then(
      (mod) => mod.BranchLocationPicker,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 w-full items-center justify-center rounded-md border border-line bg-canvas text-xs text-muted">
        Loading interactive map…
      </div>
    ),
  },
);

const initialState: UpdateBranchState = {};

const HOURS_PRESETS = [
  { label: "24 Hours / Always Open", is24h: true, open: "00:00", close: "23:59" },
  { label: "07:00 - 23:00 (Standard)", is24h: false, open: "07:00", close: "23:00" },
  { label: "06:00 - 00:00 (Late Night)", is24h: false, open: "06:00", close: "00:00" },
  { label: "08:00 - 22:00 (Mall Hours)", is24h: false, open: "08:00", close: "22:00" },
] as const;

function parseInitialHours(raw: string): {
  is24Hours: boolean;
  openTime: string;
  closeTime: string;
} {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase() === "24 hours") {
    return { is24Hours: true, openTime: "07:00", closeTime: "23:00" };
  }
  const match = trimmed.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  if (match) {
    return { is24Hours: false, openTime: match[1], closeTime: match[2] };
  }
  return { is24Hours: false, openTime: "07:00", closeTime: "23:00" };
}

function roleLabel(role: ManagerOption["role"]) {
  if (role === "owner") return "Owner";
  if (role === "branch_manager") return "Branch manager";
  return "Unassigned — promote to Branch manager";
}

export interface BranchDetailsFormProps {
  branch: BranchDetail;
  isOwner: boolean;
  managers: ManagerOption[];
}

export function BranchDetailsForm({
  branch,
  isOwner,
  managers,
}: BranchDetailsFormProps) {
  const router = useRouter();
  const boundUpdateAction = updateWorkspaceBranch.bind(null, branch.id);
  const [state, action, pending] = useActionState(boundUpdateAction, initialState);

  const parsedHours = parseInitialHours(branch.opening_hours);
  const [is24Hours, setIs24Hours] = useState(parsedHours.is24Hours);
  const [openTime, setOpenTime] = useState(parsedHours.openTime);
  const [closeTime, setCloseTime] = useState(parsedHours.closeTime);
  const [serviceStatus, setServiceStatus] = useState<"open" | "closed">(branch.service_status);
  const [latitude, setLatitude] = useState(
    branch.latitude !== null ? String(branch.latitude) : "",
  );
  const [longitude, setLongitude] = useState(
    branch.longitude !== null ? String(branch.longitude) : "",
  );

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const openingHoursValue = is24Hours ? "24 Hours" : `${openTime} - ${closeTime}`;

  const handleDeleteBranch = () => {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const res = await deleteWorkspaceBranch(branch.id);
      if (!res.success) {
        setDeleteError(res.message ?? "Unable to delete branch.");
        return;
      }
      router.push("/branches");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <form
        action={action}
        aria-label="Edit branch details"
        className="rounded-md border border-line bg-surface p-5 md:p-6 space-y-6"
      >
        {state.message ? (
          <p
            role={state.success ? "status" : "alert"}
            className={`rounded border px-3 py-2 text-xs ${
              state.success
                ? "border-ok/40 bg-ok/10 text-ok"
                : "border-danger bg-canvas text-danger"
            }`}
          >
            {state.message}
          </p>
        ) : null}

        {/* Branch Identity & Service Status */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Branch Identity & Status</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-xs text-muted">
              <span>Branch name</span>
              <input
                name="name"
                required
                maxLength={120}
                defaultValue={branch.name}
                className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm text-ink"
              />
            </label>

            <label className="block space-y-1.5 text-xs text-muted">
              <span>Service status</span>
              <select
                name="service_status"
                value={serviceStatus}
                onChange={(e) => setServiceStatus(e.target.value as "open" | "closed")}
                className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm text-ink"
              >
                <option value="open">Open to customers</option>
                <option value="closed">Closed to customers</option>
              </select>
            </label>

            <label className="block space-y-1.5 text-xs text-muted">
              <span>Contact phone</span>
              <input
                name="contact_phone"
                required
                maxLength={32}
                defaultValue={branch.contact_phone}
                className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm font-mono text-ink"
              />
            </label>

            {isOwner && managers.length > 0 ? (
              <label className="block space-y-1.5 text-xs text-muted">
                <span>Primary branch manager</span>
                <select
                  name="primary_manager_user_id"
                  required
                  defaultValue={branch.primary_manager_user_id}
                  className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm text-ink"
                >
                  {managers.map((manager) => (
                    <option key={manager.user_id} value={manager.user_id}>
                      {manager.full_name} ({roleLabel(manager.role)})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="block space-y-1.5 text-xs text-muted">
                <span>Primary branch manager</span>
                <div className="flex h-10 w-full items-center rounded border border-line bg-canvas/60 px-3 text-sm text-ink">
                  {branch.primary_manager?.full_name || "Assigned Branch Manager"}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Operating Hours */}
        <section className="space-y-4 border-t border-line pt-5">
          <h2 className="text-sm font-semibold text-ink">Operating Hours</h2>
          <input type="hidden" name="opening_hours" value={openingHoursValue} />
          <div className="rounded border border-line bg-canvas p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {HOURS_PRESETS.map((preset) => {
                  const active = is24Hours
                    ? preset.is24h
                    : !preset.is24h &&
                      openTime === preset.open &&
                      closeTime === preset.close;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setIs24Hours(preset.is24h);
                        if (!preset.is24h) {
                          setOpenTime(preset.open);
                          setCloseTime(preset.close);
                        }
                      }}
                      className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-line bg-surface text-muted hover:text-ink"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <span className="font-mono text-xs text-ink">{openingHoursValue}</span>
            </div>

            {!is24Hours ? (
              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <label className="block space-y-1 text-xs text-muted">
                  <span>Opens at</span>
                  <input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value || "07:00")}
                    className="h-9 w-full rounded border border-line bg-surface px-2.5 font-mono text-xs text-ink"
                  />
                </label>
                <label className="block space-y-1 text-xs text-muted">
                  <span>Closes at</span>
                  <input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value || "23:00")}
                    className="h-9 w-full rounded border border-line bg-surface px-2.5 font-mono text-xs text-ink"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </section>

        {/* Address & Map Coordinates */}
        <section className="space-y-4 border-t border-line pt-5">
          <h2 className="text-sm font-semibold text-ink">Address & Location</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5 text-xs text-muted md:col-span-2">
              <span>Street address</span>
              <input
                name="address"
                required
                maxLength={240}
                defaultValue={branch.address}
                className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1.5 text-xs text-muted">
              <span>City</span>
              <input
                name="city"
                required
                maxLength={100}
                defaultValue={branch.city}
                className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1.5 text-xs text-muted">
              <span>State / region</span>
              <input
                name="region"
                required
                maxLength={100}
                defaultValue={branch.region}
                className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1.5 text-xs text-muted">
              <span>Postal code</span>
              <input
                name="postal_code"
                required
                maxLength={20}
                defaultValue={branch.postal_code}
                className="h-10 w-full rounded border border-line bg-canvas px-3 text-sm font-mono text-ink"
              />
            </label>
          </div>

          <div className="space-y-2 pt-2">
            <BranchLocationPicker
              latitude={latitude}
              longitude={longitude}
              onChange={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
            />
            <input type="hidden" name="latitude" value={latitude} />
            <input type="hidden" name="longitude" value={longitude} />
          </div>
        </section>

        <div className="flex justify-end border-t border-line pt-4">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded bg-accent px-5 text-xs font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {isOwner ? (
        <section className="rounded-md border border-danger/40 bg-surface p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-ink">Delete Branch</h2>
              <p className="text-xs text-muted">
                Permanently remove {branch.name} and unassign its personnel.
              </p>
            </div>

            {!confirmingDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded border border-danger/50 bg-danger/10 px-3.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete branch
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmingDelete(false)}
                  className="inline-flex h-9 items-center rounded border border-line bg-canvas px-3 text-xs font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteBranch}
                  className="inline-flex h-9 items-center rounded bg-danger px-3.5 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting…" : "Confirm delete"}
                </button>
              </div>
            )}
          </div>

          {deleteError ? (
            <p
              role="alert"
              className="mt-3 rounded border border-danger bg-canvas px-3 py-2 text-xs text-danger"
            >
              {deleteError}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

