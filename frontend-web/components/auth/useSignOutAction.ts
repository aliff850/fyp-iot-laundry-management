"use client";

import { useActionState, useTransition } from "react";
import { signOut } from "@/app/auth/actions";
import { unregisterPushSubscription } from "@/app/notifications/actions";
import { clearWorkspaceNotificationsStorage } from "@/components/workspace/notifications/notificationLogic";
import { cleanupPushOnSignOut } from "@/components/workspace/notifications/pushClient";
import type { AuthFormState } from "@/lib/auth/validation";

/**
 * Coordinates workspace cleanup, push unsubscribe, and server sign-out while ensuring
 * the React 19 `useActionState` dispatcher always runs inside a synchronous transition.
 */
export async function runSignOutWithCleanup(
  cleanupPush: () => Promise<void>,
  clearStorage: () => void,
  startTransitionFn: (callback: () => void) => void,
  dispatchAction: () => void,
): Promise<void> {
  clearStorage();
  try {
    await cleanupPush();
  } finally {
    // Re-enter startTransition after awaiting so useActionState keeps an active transition scope.
    startTransitionFn(() => {
      dispatchAction();
    });
  }
}

export function useSignOutAction() {
  const [state, action, pending] = useActionState<AuthFormState>(signOut, {});
  const [cleaning, startTransition] = useTransition();
  const isPending = pending || cleaning;

  function handleSignOutAction() {
    startTransition(async () => {
      await runSignOutWithCleanup(
        () => cleanupPushOnSignOut(unregisterPushSubscription),
        clearWorkspaceNotificationsStorage,
        startTransition,
        action,
      );
    });
  }

  return { state, isPending, handleSignOutAction };
}
