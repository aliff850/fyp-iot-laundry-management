"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, MapPin, Plus, Trash2 } from "lucide-react";
import { BranchMap } from "@/components/workspace/branches/BranchMap";
import { deleteWorkspaceBranch } from "@/app/branches/actions";
import { primaryButton, secondaryButton } from "@/lib/auth/styles";
import type { WorkspaceBranch } from "@/lib/auth/business";

export function BranchDirectoryView({
  branches,
  owner = false,
}: {
  branches: WorkspaceBranch[];
  owner?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceBranch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && deleteTarget && !isDeleting) {
        setDeleteTarget(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, isDeleting]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteWorkspaceBranch(deleteTarget.id);
      if (!res.success) {
        setDeleteError(res.message || "Failed to delete branch.");
        setIsDeleting(false);
        return;
      }
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
      }
      setDeleteTarget(null);
      setIsDeleting(false);
      router.refresh();
    } catch {
      setDeleteError("A network error occurred. Please try again.");
      setIsDeleting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Column: Interactive Map (always rendered) */}
      <div className="relative z-0 flex flex-col lg:col-span-7 xl:col-span-7">
        <BranchMap
          branches={branches}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Right Column: Branch Directory List or Empty State */}
      <div className="relative flex flex-col lg:col-span-5 xl:col-span-5">
        {branches.length === 0 ? (
          <section
            className="flex h-auto flex-col justify-between rounded-md border border-line bg-surface p-6 md:p-8 lg:absolute lg:inset-0"
            aria-labelledby="empty-locations-title"
          >
            <div>
              <div className="inline-flex size-11 items-center justify-center rounded-md border border-line bg-raised">
                <MapPin className="size-5 text-accent" aria-hidden="true" />
              </div>
              <h3
                id="empty-locations-title"
                className="mt-5 text-base font-semibold text-ink"
              >
                {owner ? "Your first branch starts here" : "No branches assigned yet"}
              </h3>
              <p className="mt-2 text-sm text-muted">
                {owner
                  ? "Add your first location to begin organizing the laundry operation. Machines and sensors are configured later."
                  : "Your owner has approved your role but has not assigned a branch. Contact them for access."}
              </p>
            </div>
            {owner && (
              <div className="mt-8">
                <Link href="/branches/new" className={primaryButton}>
                  <Plus className="size-4" aria-hidden="true" />
                  Create branch
                </Link>
              </div>
            )}
          </section>
        ) : (
          <section
            className="flex h-auto flex-col rounded-md border border-line bg-surface p-5 md:p-6 lg:absolute lg:inset-0"
            aria-labelledby="locations-title"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-rule pb-3">
              <div>
                <h3 id="locations-title" className="text-base font-semibold text-ink">
                  Locations
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {branches.length} {branches.length === 1 ? "location" : "locations"} available
                </p>
              </div>
              {owner && (
                <Link
                  href="/branches/new"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-ink bg-ink px-3 py-1 text-xs font-semibold text-surface transition-colors hover:border-muted hover:bg-muted active:bg-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add branch
                </Link>
              )}
            </div>

            <ul
              className="mt-3 flex-1 min-h-0 divide-y divide-rule overflow-y-auto pr-1"
              aria-label="Branch directory list"
            >
              {branches.map(branch => {
                const isSelected = selectedId === branch.id;
                return (
                  <li key={branch.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div
                      className={`rounded-md border p-3 transition-colors ${isSelected
                          ? "border-line bg-navy"
                          : "border-transparent bg-surface hover:bg-raised"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(isSelected ? null : branch.id)}
                          aria-pressed={isSelected}
                          className="text-left font-semibold text-sm text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {branch.name}
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="rounded border border-line bg-raised px-2 py-0.5 text-xs text-muted">
                            {branch.service_status === "open"
                              ? "Open to customers"
                              : "Closed to customers"}
                          </span>
                          {owner && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(branch);
                              }}
                              className="inline-flex size-6 items-center justify-center rounded border border-transparent text-muted transition-colors hover:border-negative/50 hover:bg-negative/15 hover:text-negative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              aria-label={`Delete ${branch.name}`}
                              title={`Delete ${branch.name}`}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(isSelected ? null : branch.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(isSelected ? null : branch.id);
                          }
                        }}
                        className="mt-1 cursor-pointer select-none"
                      >
                        <p className="text-xs text-muted">
                          {branch.address}, {branch.city}, {branch.region} {branch.postal_code}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2 text-faint">
                            <span>
                              {branch.latitude !== null && branch.longitude !== null
                                ? "Map pin active"
                                : "Map location not set"}
                            </span>
                            <span>·</span>
                            <span>Hours: {branch.opening_hours}</span>
                          </div>
                          <Link
                            href={`/branches/${branch.id}`}
                            className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <span>Dashboard</span>
                            <ArrowRight className="size-3" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {/* Branch Deletion Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-xs p-4"
          role="presentation"
          onClick={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-desc"
            className="w-full max-w-md rounded-md border border-control bg-surface p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-negative">
              <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
              <h3 id="delete-dialog-title" className="text-base font-semibold text-ink">
                Delete branch
              </h3>
            </div>

            <p id="delete-dialog-desc" className="mt-3 text-sm text-muted">
              Are you sure you want to delete <strong className="text-ink">{deleteTarget.name}</strong>?
            </p>

            <div className="mt-2 rounded-md border border-rule bg-raised/50 p-2.5 text-xs text-muted">
              <span className="font-medium text-ink">{deleteTarget.name}</span>
              <br />
              {deleteTarget.address}, {deleteTarget.city}, {deleteTarget.region} {deleteTarget.postal_code}
            </div>

            <p className="mt-3 text-xs text-negative">
              This action is permanent and cannot be undone. All assigned personnel records for this branch will be removed.
            </p>

            {deleteError && (
              <p className="mt-3 text-xs font-medium text-negative" role="alert">
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className={secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-negative bg-negative px-4 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-ink motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none"
              >
                {isDeleting ? "Deleting…" : "Delete branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
