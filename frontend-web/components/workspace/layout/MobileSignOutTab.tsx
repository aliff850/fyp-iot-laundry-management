"use client";

import React, { useState, useEffect, useActionState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import type { AuthFormState } from "@/lib/auth/validation";

export function MobileSignOutTab() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, action, pending] = useActionState<AuthFormState>(signOut, {});

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Sign out"
        className="flex flex-col items-center justify-center min-h-[52px] py-1 px-1 rounded-md text-muted transition-colors hover:text-ink hover:bg-navy-hover/40 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <LogOut className="size-5 shrink-0" aria-hidden="true" />
        <span className="text-[10px] sm:text-xs font-medium tracking-tight mt-1 truncate max-w-full">
          Sign Out
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-signout-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-2xl animate-in fade-in-0 zoom-in-95"
            role="document"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-negative/10 text-negative border border-negative/20">
                <LogOut className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="mobile-signout-title" className="text-base font-semibold text-ink">
                  Sign out
                </h2>
                <p className="text-xs text-muted">
                  Are you sure you want to sign out of SpinSense?
                </p>
              </div>
            </div>

            {state?.message && (
              <p className="mb-3 text-xs text-negative">{state.message}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-rule">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={pending}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <form action={action}>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-negative bg-negative px-3.5 py-2 text-xs font-medium text-surface transition-colors hover:bg-negative/90 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Signing out…" : "Sign out"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

