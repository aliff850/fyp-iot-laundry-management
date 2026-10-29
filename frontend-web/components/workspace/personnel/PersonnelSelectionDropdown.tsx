"use client";

import React, { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectionOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface PersonnelSelectionDropdownProps {
  mode: "radio" | "checkbox";
  userId: string;
  options: SelectionOption[];
  currentValues: string[]; // ['role'] or ['branch-id-1', 'branch-id-2']
  isOwnerRow?: boolean;
  fieldName: string; // 'role' or 'branchIds'
  buttonPlaceholder?: string;
  ownerText?: string;
  ariaLabel: string;
  defaultOpen?: boolean;
  serverAction: (
    state: { message?: string; success?: boolean },
    formData: FormData
  ) => Promise<{ message?: string; success?: boolean }>;
}

export function PersonnelSelectionDropdown({
  mode,
  userId,
  options,
  currentValues,
  isOwnerRow = false,
  fieldName,
  buttonPlaceholder = "Select…",
  ownerText = "Owner",
  ariaLabel,
  defaultOpen = false,
  serverAction,
}: PersonnelSelectionDropdownProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selected, setSelected] = useState<string[]>(currentValues);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: "bottom" | "top" } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  // Track hydration for client-side portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronize when currentValues prop changes
  useEffect(() => {
    setSelected(currentValues);
  }, [currentValues]);

  // Compute fixed position relative to trigger button
  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 256; // 16rem (w-64)
    const estimatedHeight = 280;
    const padding = 8;
    const spacing = 6;

    // Horizontal placement: align with trigger left, clamped inside viewport
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = Math.max(padding, rect.right - popoverWidth);
    }

    // Vertical placement: open downwards by default; flip up if overflowing viewport bottom
    let top = rect.bottom + spacing;
    let placement: "bottom" | "top" = "bottom";

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      top = Math.max(padding, rect.top - spacing);
      placement = "top";
    }

    setCoords({ top, left, placement });
  }, []);

  // Toggle trigger button with immediate coordinates update
  function handleToggleOpen() {
    setIsOpen(prev => {
      const next = !prev;
      if (next) {
        updateCoords();
      }
      return next;
    });
  }

  // Handle outside clicks, keyboard dismiss, and scroll/resize updates
  useEffect(() => {
    if (!isOpen) return;

    updateCoords();

    function handleScrollOrResize() {
      updateCoords();
    }

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
        // Reset uncommitted changes
        setSelected(currentValues);
        setStatusMessage(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSelected(currentValues);
        setStatusMessage(null);
      }
    }

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, currentValues, updateCoords]);

  if (isOwnerRow) {
    return <span className="text-xs text-faint italic">{ownerText}</span>;
  }

  // Determine if selection has changed from committed values
  const currentSet = new Set(currentValues);
  const selectedSet = new Set(selected);
  const hasChanged =
    currentSet.size !== selectedSet.size ||
    [...selectedSet].some(v => !currentSet.has(v));

  // Determine trigger button label
  let triggerLabel = buttonPlaceholder;
  if (mode === "radio") {
    const activeVal = selected[0] ?? "";
    const activeOpt = options.find(o => o.value === activeVal);
    triggerLabel = activeOpt ? activeOpt.label : buttonPlaceholder;
  } else {
    // Checkbox mode
    if (selected.length === 0) {
      triggerLabel = buttonPlaceholder;
    } else if (selected.length === 1) {
      const match = options.find(o => o.value === selected[0]);
      triggerLabel = match ? match.label : "1 location";
    } else {
      triggerLabel = `${selected.length} locations`;
    }
  }

  function handleSelectOption(val: string) {
    setStatusMessage(null);
    if (mode === "radio") {
      setSelected([val]);
    } else {
      // Checkbox mode
      if (selected.includes(val)) {
        setSelected(selected.filter(v => v !== val));
      } else {
        setSelected([...selected, val]);
      }
    }
  }

  function handleSave() {
    setStatusMessage(null);
    const formData = new FormData();
    formData.append("userId", userId);
    if (mode === "radio") {
      formData.append(fieldName, selected[0] ?? "");
    } else {
      for (const val of selected) {
        formData.append(fieldName, val);
      }
    }

    startTransition(async () => {
      try {
        const res = await serverAction({}, formData);
        if (res.success) {
          setStatusMessage({ text: res.message ?? "Saved", isError: false });
          setTimeout(() => {
            setIsOpen(false);
            setStatusMessage(null);
          }, 800);
        } else {
          setStatusMessage({ text: res.message ?? "Failed to save", isError: true });
        }
      } catch {
        setStatusMessage({ text: "A network error occurred. Please retry.", isError: true });
      }
    });
  }

  const popoverContent = (
    <div
      ref={popoverRef}
      id={popoverId}
      role="dialog"
      aria-label={ariaLabel}
      style={
        mounted && coords
          ? {
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: coords.placement === "top" ? "translateY(-100%)" : "none",
              width: "16rem",
              zIndex: 9999,
            }
          : undefined
      }
      className={
        mounted
          ? "rounded-md border border-line bg-surface p-2 shadow-2xl focus:outline-none"
          : "absolute left-0 top-full z-50 mt-1.5 w-64 rounded-md border border-line bg-surface p-2 shadow-xl focus:outline-none"
      }
    >
      {/* Options List */}
      <div className="max-h-56 overflow-y-auto divide-y divide-rule/50 pr-0.5">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs italic text-faint">
            No options available
          </p>
        ) : (
          options.map(opt => {
            const isChecked = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelectOption(opt.value)}
                disabled={opt.disabled || isPending}
                role={mode === "radio" ? "radio" : "checkbox"}
                aria-checked={isChecked}
                className="flex w-full items-start gap-2.5 rounded px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-raised/80 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {/* Visual Indicator: Radio Circle or Checkbox Square */}
                <div className="mt-0.5 shrink-0">
                  {mode === "radio" ? (
                    <div
                      className={`size-3.5 rounded-full border flex items-center justify-center transition-colors ${
                        isChecked
                          ? "border-accent bg-accent/20"
                          : "border-control/60 bg-canvas"
                      }`}
                    >
                      {isChecked && (
                        <div className="size-1.5 rounded-full bg-accent" />
                      )}
                    </div>
                  ) : (
                    <div
                      className={`size-3.5 rounded border flex items-center justify-center transition-colors ${
                        isChecked
                          ? "border-accent bg-accent text-surface"
                          : "border-control/60 bg-canvas"
                      }`}
                    >
                      {isChecked && (
                        <Check className="size-2.5 stroke-[3]" aria-hidden="true" />
                      )}
                    </div>
                  )}
                </div>

                {/* Label & Description */}
                <div className="flex flex-col min-w-0">
                  <span
                    className={`leading-tight ${
                      isChecked ? "font-semibold text-ink" : "font-normal text-ink"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="mt-0.5 text-[11px] leading-tight text-faint">
                      {opt.description}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-2.5 flex items-center justify-between border-t border-rule pt-2">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setSelected(currentValues);
            setStatusMessage(null);
          }}
          className="inline-flex min-h-7 items-center rounded border border-line bg-navy px-2 py-0.5 text-xs text-muted transition-colors hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !hasChanged}
          className={`inline-flex min-h-7 items-center rounded border px-3 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none ${
            hasChanged && !isPending
              ? "border-ink bg-ink text-surface hover:border-muted hover:bg-muted"
              : "border-control/30 bg-raised text-muted cursor-not-allowed opacity-50"
          }`}
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Inline Status Feedback */}
      {statusMessage && (
        <div
          role="status"
          className={`mt-2 rounded px-2 py-1 text-[11px] font-medium ${
            statusMessage.isError
              ? "border border-negative/30 bg-negative/10 text-negative"
              : "border border-positive/30 bg-positive/10 text-positive"
          }`}
        >
          {statusMessage.text}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative inline-flex flex-col">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleOpen}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-label={ariaLabel}
        className={`inline-flex min-h-8 items-center justify-between gap-2 rounded border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
          isOpen
            ? "border-accent bg-navy text-ink"
            : "border-control/40 bg-surface text-ink hover:border-control hover:bg-raised"
        }`}
      >
        <span className="truncate max-w-[140px] text-left">{triggerLabel}</span>
        <ChevronDown
          className={`size-3 text-muted shrink-0 transition-transform duration-150 motion-reduce:transition-none ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Floating Popover Menu: portaled to body in browser to prevent clipping in overflow-x-auto */}
      {isOpen && (mounted && typeof document !== "undefined" ? createPortal(popoverContent, document.body) : popoverContent)}
    </div>
  );
}

