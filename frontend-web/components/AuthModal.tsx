"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (operatorName: string) => void;
}

// Compatibility for the gated prototype: authentication now has dedicated pages.
export function AuthModal({ isOpen }: AuthModalProps) {
  const router = useRouter();
  useEffect(() => {
    if (isOpen) router.push("/login");
  }, [isOpen, router]);
  return null;
}
