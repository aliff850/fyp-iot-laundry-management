"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Phone, Trash2 } from "lucide-react";
import type { WorkspaceBranch } from "@/lib/auth/business";

export interface BranchDirectoryCardProps {
  branch: WorkspaceBranch;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  owner?: boolean;
}

export function BranchDirectoryCard({
  branch,
  isSelected = false,
  onSelect,
  onDelete,
  owner = false,
}: BranchDirectoryCardProps) {
  const hasCoordinates = branch.latitude !== null && branch.longitude !== null;

  return (
    <article
      className={`rounded-md border p-3.5 sm:p-4 transition-colors duration-150 motion-reduce:transition-none ${isSelected
        ? "border-accent/40 bg-navy"
        : "border-line bg-surface hover:border-control/60 hover:bg-raised/30"
        }`}
    >
      {/* Header: Branch Name & Status / Delete Actions */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={isSelected}
          className="group/title inline-flex min-h-11 items-center gap-2.5 text-left font-semibold text-sm sm:text-base text-ink transition-colors duration-150 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          title={isSelected ? "Deselect on map" : "Show pin on map"}
        >
          <MapPin
            className={`size-4 shrink-0 transition-colors duration-150 ${isSelected ? "text-accent" : "text-muted group-hover/title:text-accent"
              }`}
            aria-hidden="true"
          />
          <span className="break-words">{branch.name}</span>
        </button>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <span
            className={`inline-flex min-h-7 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium ${branch.service_status === "open"
              ? "border border-positive/30 bg-positive/10 text-positive"
              : "border border-line bg-raised text-muted"
              }`}
          >
            {branch.service_status === "open" ? "Open to customers" : "Closed to customers"}
          </span>

          {owner && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-transparent text-muted transition-colors duration-150 hover:border-negative/40 hover:bg-negative/15 hover:text-negative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              aria-label={`Delete ${branch.name}`}
              title={`Delete ${branch.name}`}
            >
              <Trash2 className="size-4 shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Address */}
      <p className="mt-1 text-xs sm:text-sm text-muted">
        {branch.address}, {branch.city}, {branch.region} {branch.postal_code}
      </p>

      {/* Structured Details: Clear separation for Map Pin, Hours, and Phone */}
      <dl className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-3 border-t border-rule/70 pt-3">
        {/* Box 1: Map Pin Status */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-2.5 sm:p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <MapPin
              className={`size-3.5 shrink-0 ${hasCoordinates ? "text-accent" : "text-muted"}`}
              aria-hidden="true"
            />
            <span>Map pin status</span>
          </dt>
          <dd className="mt-1 text-xs sm:text-sm font-semibold text-ink">
            {hasCoordinates ? "Map pin active" : "Location not set"}
          </dd>
        </div>

        {/* Box 2: Working Hours */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-2.5 sm:p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Clock className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span>Working hours</span>
          </dt>
          <dd className="mt-1 text-xs sm:text-sm font-semibold text-ink">
            {branch.opening_hours}
          </dd>
        </div>

        {/* Box 3: Contact Phone */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-2.5 sm:p-3">
          <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Phone className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
            <span>Contact phone</span>
          </dt>
          <dd className="mt-1 text-xs sm:text-sm font-semibold text-ink tabular-nums">
            {branch.contact_phone || "Not provided"}
          </dd>
        </div>
      </dl>

      {/* Action Row: Open Dashboard */}
      <div className="mt-3 flex items-center justify-end">
        <Link
          href={`/branches/${branch.id}`}
          className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-1.5 rounded-md border border-control/80 bg-surface px-4 py-2 text-xs sm:text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <span>Dashboard</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export interface BranchDirectoryListProps {
  branches: WorkspaceBranch[];
  selectedId?: string | null;
  onSelectBranch?: (id: string | null) => void;
  onDeleteBranch?: (branch: WorkspaceBranch) => void;
  owner?: boolean;
  className?: string;
}

export function BranchDirectoryList({
  branches,
  selectedId = null,
  onSelectBranch,
  onDeleteBranch,
  owner = false,
  className = "",
}: BranchDirectoryListProps) {
  return (
    <ul
      className={`mt-3 flex-1 min-h-0 space-y-2.5 overflow-y-auto pr-1 ${className}`.trim()}
      aria-label="Branch directory list"
      role="list"
    >
      {branches.map(branch => {
        const isSelected = selectedId === branch.id;
        return (
          <li key={branch.id}>
            <BranchDirectoryCard
              branch={branch}
              isSelected={isSelected}
              onSelect={() => onSelectBranch?.(isSelected ? null : branch.id)}
              onDelete={onDeleteBranch ? () => onDeleteBranch(branch) : undefined}
              owner={owner}
            />
          </li>
        );
      })}
    </ul>
  );
}

