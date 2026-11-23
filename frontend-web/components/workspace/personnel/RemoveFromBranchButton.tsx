"use client";

import React, { useTransition } from "react";
import { UserMinus } from "lucide-react";
import { removePersonnelFromBranch } from "@/app/personnel/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";

interface RemoveFromBranchButtonProps {
  branchId: string;
  userId: string;
  fullName: string;
  isOwnerRow?: boolean;
  isPrimaryManager?: boolean;
}

export function RemoveFromBranchButton({
  branchId,
  userId,
  fullName,
  isOwnerRow = false,
  isPrimaryManager = false,
}: RemoveFromBranchButtonProps) {
  const { notify } = useActionToast();
  const [isPending, startTransition] = useTransition();

  if (isOwnerRow) {
    return <span className="text-xs text-faint">All locations (Owner)</span>;
  }

  if (isPrimaryManager) {
    return <span className="text-xs text-faint">Primary Manager</span>;
  }

  const handleRemove = () => {
    const toastId = `personnel-remove-${branchId}-${userId}`;
    notify({
      id: toastId,
      kind: "info",
      title: "Updating branch roster",
      message: `Removing ${fullName} from branch…`,
    });
    startTransition(async () => {
      const res = await removePersonnelFromBranch(branchId, userId);
      if (!res.success) {
        notify({
          id: toastId,
          kind: "error",
          title: "Removal failed",
          message: res.message,
        });
        return;
      }
      notify({
        id: toastId,
        kind: "success",
        title: "Staff removed",
        message: `${fullName} removed from branch.`,
      });
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        aria-label={`Remove ${fullName} from branch`}
        className="inline-flex min-h-8 items-center gap-1.5 rounded border border-negative/40 bg-negative/10 px-2.5 py-1 text-xs font-medium text-negative transition-colors hover:bg-negative/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <UserMinus className="size-3 shrink-0" aria-hidden="true" />
        <span>{isPending ? "Removing…" : "Remove from branch"}</span>
      </button>
    </div>
  );
}

