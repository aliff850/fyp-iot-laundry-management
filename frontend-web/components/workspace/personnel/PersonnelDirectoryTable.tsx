import React from "react";
import { PersonnelRoleSelect } from "@/components/workspace/personnel/PersonnelRoleSelect";
import { PersonnelSelectionDropdown } from "@/components/workspace/personnel/PersonnelSelectionDropdown";
import { RemoveFromBranchButton } from "@/components/workspace/personnel/RemoveFromBranchButton";
import { updatePersonnelBranches } from "@/app/personnel/actions";
import type {
  OrganizationPersonnel,
  WorkspaceBranch,
} from "@/lib/auth/business";

export interface PersonnelDirectoryTableProps {
  variant: "organization" | "branch";
  personnel: OrganizationPersonnel[];
  branches?: WorkspaceBranch[];
  branchId?: string;
  canManage?: boolean;
}

export function PersonnelDirectoryTable({
  variant,
  personnel,
  branches = [],
  branchId = "",
  canManage = true,
}: PersonnelDirectoryTableProps) {
  const branchOptions = branches.map(b => ({
    value: b.id,
    label: b.name,
    description: b.address,
  }));

  if (personnel.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-rule bg-raised/20 p-6 text-center">
        <p className="text-xs text-muted">
          {variant === "branch"
            ? "No personnel are currently assigned to this branch."
            : "No approved personnel members found in this organization."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-rule">
      <table className="w-full min-w-180 border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-rule bg-raised/30 text-xs font-normal text-muted">
            <th className="px-4 py-3">Member</th>
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Assigned Role</th>
            <th className="px-4 py-3">Access Status</th>
            <th className="px-4 py-3">
              {variant === "organization"
                ? "Assigned Locations"
                : "Branch Assignment"}
            </th>
            <th className="px-4 py-3">Role Management</th>
            <th className="px-4 py-3">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {personnel.map(person => {
            const roleBadge = formatRoleBadge(person.role);
            return (
              <tr
                key={person.user_id}
                className="transition-colors hover:bg-raised/40"
              >
                <td className="px-4 py-3 font-medium text-ink">
                  {person.full_name}
                </td>
                <td className="px-4 py-3 text-xs text-muted tabular-nums">
                  {person.phone}
                </td>
                <td className="px-4 py-3">
                  <span className={roleBadge.className}>{roleBadge.label}</span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {person.state === "active" ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-positive">
                      <span className="size-1.5 rounded-full bg-positive" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-medium text-warning">
                      <span className="size-1.5 rounded-full bg-warning" />
                      Approved (Unassigned)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {variant === "organization" ? (
                    person.role === "owner" ? (
                      <span className="text-faint">All locations (Owner)</span>
                    ) : canManage ? (
                      <PersonnelSelectionDropdown
                        mode="checkbox"
                        userId={person.user_id}
                        options={branchOptions}
                        currentValues={
                          person.assigned_branch_ids &&
                          person.assigned_branch_ids.length > 0
                            ? person.assigned_branch_ids
                            : branches
                                .filter(b =>
                                  (person.assigned_branches ?? []).includes(
                                    b.name
                                  )
                                )
                                .map(b => b.id)
                        }
                        fieldName="branchIds"
                        buttonPlaceholder="Assign branches…"
                        ariaLabel={`Assign branches for ${person.full_name}`}
                        serverAction={updatePersonnelBranches}
                      />
                    ) : (
                      <span>
                        {person.assigned_branches &&
                        person.assigned_branches.length > 0
                          ? person.assigned_branches.join(", ")
                          : "Unassigned"}
                      </span>
                    )
                  ) : canManage ? (
                    <RemoveFromBranchButton
                      branchId={branchId}
                      userId={person.user_id}
                      fullName={person.full_name}
                      isOwnerRow={person.role === "owner"}
                      isPrimaryManager={Boolean(person.is_primary_manager)}
                    />
                  ) : person.role === "owner" ? (
                    <span className="text-faint">All locations (Owner)</span>
                  ) : person.is_primary_manager ? (
                    <span className="text-faint">Primary Manager</span>
                  ) : (
                    <span className="text-muted">Assigned to branch</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <PersonnelRoleSelect
                      userId={person.user_id}
                      currentRole={person.role}
                      isOwnerRow={person.role === "owner"}
                    />
                  ) : (
                    <span className="text-xs text-faint">
                      {roleBadge.label} (View only)
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-faint">
                  {new Date(person.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function formatRoleBadge(role: string | null): {
  label: string;
  className: string;
} {
  if (!role) {
    return {
      label: "Unassigned",
      className:
        "rounded border border-line bg-raised px-2 py-0.5 text-xs font-medium text-muted",
    };
  }
  switch (role) {
    case "owner":
      return {
        label: "Owner",
        className:
          "rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent",
      };
    case "branch_manager":
      return {
        label: "Branch Manager",
        className:
          "rounded border border-line bg-raised px-2 py-0.5 text-xs font-medium text-ink",
      };
    case "machine_maintenance":
      return {
        label: "Machine Maintenance",
        className:
          "rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning",
      };
    case "lpg_maintenance":
      return {
        label: "LPG Maintenance",
        className:
          "rounded border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive",
      };
    default:
      return {
        label: role,
        className:
          "rounded border border-line bg-raised px-2 py-0.5 text-xs font-medium text-muted",
      };
  }
}

