"use client";

import { useMemo } from "react";
import {
  PersonnelSelectionDropdown,
  type SelectionOption,
} from "./PersonnelSelectionDropdown";
import { updatePersonnelBranches } from "@/app/personnel/actions";
import type { WorkspaceBranch } from "@/lib/auth/business";

export interface PersonnelBranchSelectProps {
  userId: string;
  fullName: string;
  branches: WorkspaceBranch[];
  assignedBranchIds?: string[];
  assignedBranchNames?: string[];
  isOwnerRow?: boolean;
  defaultOpen?: boolean;
}

export function PersonnelBranchSelect({
  userId,
  fullName,
  branches,
  assignedBranchIds = [],
  assignedBranchNames = [],
  isOwnerRow = false,
  defaultOpen = false,
}: PersonnelBranchSelectProps) {
  const options: SelectionOption[] = useMemo(
    () =>
      branches.map(b => ({
        value: b.id,
        label: b.name,
      })),
    [branches]
  );

  const currentValues = useMemo(() => {
    const normalizedIdSet = new Set(
      assignedBranchIds.map(id => id.trim().toLowerCase()).filter(Boolean)
    );
    const normalizedNameSet = new Set(
      assignedBranchNames.map(name => name.trim().toLowerCase()).filter(Boolean)
    );
    const normalizedUserId = userId.trim().toLowerCase();

    const matchedIds: string[] = [];
    for (const branch of branches) {
      const bid = branch.id.trim().toLowerCase();
      const bname = branch.name.trim().toLowerCase();
      const isPrimary =
        branch.primary_manager_user_id?.trim().toLowerCase() === normalizedUserId;
      if (
        normalizedIdSet.has(bid) ||
        normalizedNameSet.has(bname) ||
        isPrimary
      ) {
        matchedIds.push(branch.id);
      }
    }

    // Preserve any explicitly passed IDs even if branches array wasn't loaded yet
    if (matchedIds.length === 0 && assignedBranchIds.length > 0) {
      return assignedBranchIds;
    }
    return matchedIds;
  }, [branches, assignedBranchIds, assignedBranchNames, userId]);

  return (
    <PersonnelSelectionDropdown
      mode="checkbox"
      userId={userId}
      isOwnerRow={isOwnerRow}
      ownerText="All locations (Owner)"
      buttonPlaceholder="Assign branches…"
      fieldName="branchIds"
      ariaLabel={`Assign branches for ${fullName}`}
      currentValues={currentValues}
      defaultOpen={defaultOpen}
      serverAction={updatePersonnelBranches}
      options={options}
    />
  );
}
