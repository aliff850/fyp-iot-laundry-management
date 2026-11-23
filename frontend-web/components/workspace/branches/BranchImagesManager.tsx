"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2, Upload } from "lucide-react";
import {
  deleteBranchImageAction,
  setBranchCoverImageAction,
  uploadBranchImageAction,
} from "@/app/branches/[branchId]/details/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import type { BranchImage } from "@/lib/auth/business";

export const MAX_BRANCH_PHOTOS = 10;
export const MAX_BRANCH_PHOTO_BYTES = 5_242_880;
const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface DraftBranchImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface BranchPhotoToastPayload {
  success: boolean;
  message: string;
  savedAt: number;
}

type ManagedProps = {
  mode: "managed";
  branchId: string;
  images: BranchImage[];
  onImagesChange: (images: BranchImage[]) => void;
  onNotify: (payload: BranchPhotoToastPayload) => void;
  disabled?: boolean;
};

type DraftProps = {
  mode: "draft";
  draftImages: DraftBranchImage[];
  onAddFiles: (files: File[]) => void;
  onSetCover: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
};

export type BranchImagesManagerProps = ManagedProps | DraftProps;

export function validateBranchPhotoFiles(
  files: File[],
  existingCount: number,
): { accepted: File[]; error: string | null } {
  const remaining = Math.max(0, MAX_BRANCH_PHOTOS - existingCount);
  if (remaining === 0) {
    return {
      accepted: [],
      error: `A branch can have at most ${MAX_BRANCH_PHOTOS} photos. Remove an existing photo first.`,
    };
  }

  const accepted: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      errors.push(`${file.name}: use PNG, JPEG, or WebP.`);
      continue;
    }
    if (file.size <= 0 || file.size > MAX_BRANCH_PHOTO_BYTES) {
      errors.push(`${file.name}: must be 5 MB or smaller.`);
      continue;
    }
    if (accepted.length >= remaining) {
      errors.push(`Only ${remaining} more photo${remaining === 1 ? "" : "s"} can be added (limit ${MAX_BRANCH_PHOTOS}).`);
      break;
    }
    accepted.push(file);
  }

  return {
    accepted,
    error: errors.length > 0 ? errors[0] : null,
  };
}

export function BranchImagesManager(props: BranchImagesManagerProps) {
  const { notify } = useActionToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const items =
    props.mode === "managed"
      ? props.images.map((img) => ({ id: img.id, url: img.image_url, altLabel: "Branch photo" }))
      : props.draftImages.map((img) => ({ id: img.id, url: img.previewUrl, altLabel: img.file.name }));

  const isDisabled = Boolean(props.disabled) || busyAction !== null;
  const remainingSlots = Math.max(0, MAX_BRANCH_PHOTOS - items.length);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) {
      if (props.mode === "managed") setQueuedFiles([]);
      return;
    }

    const { accepted, error } = validateBranchPhotoFiles(picked, items.length);
    if (error) {
      notify({
        id: "branch-photo-validation",
        kind: "error",
        title: "Invalid photo selection",
        message: error,
      });
    }

    if (props.mode === "draft") {
      if (accepted.length > 0) {
        props.onAddFiles(accepted);
      }
      e.target.value = "";
      return;
    }

    setQueuedFiles(accepted);
  };

  const handleManagedUpload = async () => {
    if (props.mode !== "managed" || queuedFiles.length === 0 || isDisabled) return;

    let latestImages = props.images;
    let latestSavedAt = 1;
    let uploadedCount = 0;

    for (let idx = 0; idx < queuedFiles.length; idx += 1) {
      const file = queuedFiles[idx];
      const stepLabel = `Uploading ${idx + 1} of ${queuedFiles.length}…`;
      setBusyAction(stepLabel);
      notify({
        id: `branch-photos-${props.branchId}`,
        kind: "info",
        title: "Uploading branch photos",
        message: stepLabel,
      });
      const formData = new FormData();
      formData.set("image", file);

      const res = await uploadBranchImageAction(props.branchId, formData);
      if (!res.success || !res.images) {
        const failureMsg = res.message || `Failed to upload ${file.name}.`;
        props.onNotify({
          success: false,
          message: failureMsg,
          savedAt: res.savedAt ?? latestSavedAt,
        });
        setBusyAction(null);
        return;
      }

      latestImages = res.images;
      latestSavedAt = res.savedAt ?? latestSavedAt;
      props.onImagesChange(latestImages);
      uploadedCount += 1;
    }

    setQueuedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setBusyAction(null);
    props.onNotify({
      success: true,
      message:
        uploadedCount === 1
          ? "Branch photo uploaded."
          : `${uploadedCount} branch photos uploaded.`,
      savedAt: latestSavedAt,
    });
  };

  const handleSetCover = async (id: string) => {
    if (isDisabled) return;
    if (props.mode === "draft") {
      props.onSetCover(id);
      return;
    }

    setBusyAction("Updating cover photo…");
    const res = await setBranchCoverImageAction(props.branchId, id);
    setBusyAction(null);
    if (!res.success || !res.images) {
      const msg = res.message || "Unable to set cover photo.";
      props.onNotify({ success: false, message: msg, savedAt: res.savedAt ?? 1 });
      return;
    }
    props.onImagesChange(res.images);
    props.onNotify({
      success: true,
      message: res.message || "Cover photo updated.",
      savedAt: res.savedAt ?? 1,
    });
  };

  const handleRemove = async (id: string) => {
    if (isDisabled) return;
    if (props.mode === "draft") {
      props.onRemove(id);
      return;
    }

    setBusyAction("Removing photo…");
    const res = await deleteBranchImageAction(props.branchId, id);
    setBusyAction(null);
    if (!res.success || !res.images) {
      const msg = res.message || "Unable to remove branch photo.";
      props.onNotify({ success: false, message: msg, savedAt: res.savedAt ?? 1 });
      return;
    }
    props.onImagesChange(res.images);
    props.onNotify({
      success: true,
      message: res.message || "Branch photo removed.",
      savedAt: res.savedAt ?? 1,
    });
  };

  return (
    <section
      aria-labelledby={props.mode === "managed" ? "branch-images-heading" : "branch-draft-images-heading"}
      className={
        props.mode === "managed"
          ? "rounded-md border border-line bg-surface p-5 md:p-6 space-y-4"
          : "md:col-span-2 space-y-3.5 rounded-md border border-line bg-canvas/40 p-4"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ImagePlus className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <h2
            id={props.mode === "managed" ? "branch-images-heading" : "branch-draft-images-heading"}
            className="text-sm font-semibold text-ink"
          >
            Branch Photos {props.mode === "draft" ? "(Optional)" : ""}
          </h2>
        </div>

        <span className="rounded-full border border-rule bg-canvas px-2.5 py-1 text-xs font-medium text-muted tabular-nums">
          {items.length} / {MAX_BRANCH_PHOTOS}
        </span>
      </div>

      <p className="text-xs text-muted">
        PNG, JPEG, or WebP up to 5 MB each. Shown to customers beneath opening hours; the first photo appears first.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="block min-w-0 flex-1">
          <span className="sr-only">Choose branch photos</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={isDisabled || remainingSlots === 0}
            onChange={handleFilePick}
            className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink file:mr-3 file:rounded file:border-0 file:bg-raised file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        {props.mode === "managed" ? (
          <button
            type="button"
            disabled={isDisabled || queuedFiles.length === 0}
            onClick={handleManagedUpload}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-navy-selected bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Upload className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {busyAction
                ? busyAction
                : queuedFiles.length > 1
                  ? `Upload ${queuedFiles.length} photos`
                  : "Upload photo"}
            </span>
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-rule bg-canvas px-4 py-6 text-center text-xs text-muted">
          No photos attached yet. Branches without photos remain valid and display &ldquo;No images available&rdquo; to customers.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, idx) => (
            <li
              key={item.id}
              className="flex flex-col overflow-hidden rounded-md border border-rule bg-canvas"
            >
              <div className="relative aspect-video w-full overflow-hidden border-b border-rule bg-raised">
                <Image
                  src={item.url}
                  alt={`${item.altLabel} ${idx + 1}`}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                {idx === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/15 px-2 py-1 text-xs font-semibold text-accent">
                    <Star className="size-3 shrink-0" aria-hidden="true" />
                    Cover
                  </span>
                ) : (
                  <span className="text-xs font-medium text-muted tabular-nums">
                    Photo #{idx + 1}
                  </span>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {idx > 0 ? (
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSetCover(item.id)}
                      className="inline-flex min-h-11 items-center justify-center rounded border border-control bg-navy px-2.5 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                    >
                      Set as cover
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={isDisabled}
                    aria-label={`Remove photo ${idx + 1}`}
                    onClick={() => handleRemove(item.id)}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded border border-negative/50 bg-negative/10 px-2.5 text-xs font-medium text-negative transition-colors hover:bg-negative/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
