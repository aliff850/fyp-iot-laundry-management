"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Notice } from "@/components/auth/AuthForm";
import { secondaryButton } from "@/lib/auth/styles";
import type { AuthFormState } from "@/lib/auth/validation";

interface SignOutButtonProps {
  variant?: "dropdown" | "button";
}

export function SignOutButton({ variant = "dropdown" }: SignOutButtonProps) {
  const [state, action, pending] = useActionState<AuthFormState>(signOut, {});
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (variant === "button") {
    return (
      <form action={action} aria-busy={pending} className="space-y-4">
        {state.message && <Notice>{state.message}</Notice>}
        <button
          type="submit"
          disabled={pending}
          className={`${secondaryButton} w-full`}
        >
          {pending ? "Signing out…" : "Sign out"}
        </button>
      </form>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        id="user-menu-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="User account menu"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-control/40 bg-raised/40 text-ink transition-colors duration-150 hover:border-control hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <User className="size-5 shrink-0" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
          className="absolute right-0 top-full mt-2 w-48 rounded-md border border-line bg-surface p-1.5 shadow-xl z-50 focus:outline-none"
        >
          <div className="py-1" role="none">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs font-medium text-ink transition-colors duration-150 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
            >
              <User className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span>Account</span>
            </Link>
          </div>

          <div className="my-1 border-t border-rule" role="separator" />

          <div className="py-1" role="none">
            <form action={action} aria-busy={pending} role="none">
              <button
                type="submit"
                role="menuitem"
                disabled={pending}
                className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-xs font-medium text-negative transition-colors duration-150 hover:bg-negative/15 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                <span>{pending ? "Signing out…" : "Sign Out"}</span>
              </button>
            </form>
          </div>

          {state.message && (
            <div className="border-t border-rule px-3 py-1.5 text-xs text-negative">
              {state.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
