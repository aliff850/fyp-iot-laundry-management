"use client";

import { useEffect } from "react";

export function SessionCleanup() {
  useEffect(() => {
    try {
      localStorage.removeItem("msu_auth_token");
      localStorage.removeItem("msu_operator_name");
    } catch {
      // Blocked browser storage cannot create or restore an authenticated session.
    }
  }, []);
  return null;
}
