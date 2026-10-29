"use client";

import { PersonnelSelectionDropdown, type SelectionOption } from "./PersonnelSelectionDropdown";
import { updatePersonnelRole } from "@/app/personnel/actions";

interface PersonnelRoleSelectProps {
  userId: string;
  currentRole: string | null;
  isOwnerRow?: boolean;
}

const ROLE_OPTIONS: SelectionOption[] = [
  { value: "", label: "Unassigned", description: "Approved applicant awaiting role assignment" },
  { value: "branch_manager", label: "Branch Manager", description: "Oversees branch operations and incident responses" },
  { value: "machine_maintenance", label: "Machine Maintenance", description: "Diagnostics & servicing for washers and dryers" },
  { value: "lpg_maintenance", label: "LPG Maintenance", description: "Safety & manifold servicing for gas cylinders" },
];

export function PersonnelRoleSelect({
  userId,
  currentRole,
  isOwnerRow = false,
}: PersonnelRoleSelectProps) {
  return (
    <PersonnelSelectionDropdown
      mode="radio"
      userId={userId}
      isOwnerRow={isOwnerRow}
      ownerText="Owner (Permanent)"
      buttonPlaceholder="Unassigned"
      fieldName="role"
      ariaLabel="Assign operational role"
      currentValues={currentRole ? [currentRole] : [""]}
      serverAction={updatePersonnelRole}
      options={ROLE_OPTIONS}
    />
  );
}
