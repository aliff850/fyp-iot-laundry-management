"use client";

import { useEffect } from "react";
import { clearWorkspaceNotificationsStorage } from "@/components/workspace/notifications/notificationLogic";
import { unsubscribeBrowserPush } from "@/components/workspace/notifications/pushClient";

export function SessionCleanup() {
  useEffect(() => {
    try {
      localStorage.removeItem("msu_auth_token");
      localStorage.removeItem("msu_operator_name");
      clearWorkspaceNotificationsStorage();
      void unsubscribeBrowserPush();
    } catch {
      // Blocked browser storage cannot create or restore an authenticated session.
    }
  }, []);
  return null;
}
