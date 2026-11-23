import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { runSignOutWithCleanup } from "@/components/auth/useSignOutAction";
import { MobileSignOutTab } from "@/components/workspace/layout/MobileSignOutTab";

describe("SignOut transition handling", () => {
  it("dispatches server action synchronously inside startTransition after async push cleanup", async () => {
    const events: string[] = [];
    let transitionDepth = 0;

    await runSignOutWithCleanup(
      async () => {
        await Promise.resolve();
        events.push("cleanup_done");
      },
      () => {
        events.push("storage_cleared");
      },
      (callback) => {
        transitionDepth += 1;
        try {
          callback();
        } finally {
          transitionDepth -= 1;
        }
      },
      () => {
        events.push(`dispatch_in_transition:${transitionDepth}`);
      },
    );

    expect(events).toEqual([
      "storage_cleared",
      "cleanup_done",
      "dispatch_in_transition:1",
    ]);
  });

  it("still dispatches server action inside startTransition if push cleanup rejects", async () => {
    const dispatchedInTransition: boolean[] = [];

    await expect(
      runSignOutWithCleanup(
        async () => {
          throw new Error("Push cleanup failed");
        },
        () => {},
        (callback) => {
          dispatchedInTransition.push(true);
          callback();
        },
        vi.fn(),
      ),
    ).rejects.toThrow("Push cleanup failed");

    expect(dispatchedInTransition).toEqual([true]);
  });

  it("renders SignOutButton and MobileSignOutTab cleanly", () => {
    const buttonHtml = renderToString(
      React.createElement(SignOutButton, { variant: "button" }),
    );
    expect(buttonHtml).toContain("Sign out");
    expect(buttonHtml).toContain("type=\"submit\"");

    const dropdownHtml = renderToString(
      React.createElement(SignOutButton, { variant: "dropdown" }),
    );
    expect(dropdownHtml).toContain("User account menu");

    const mobileHtml = renderToString(React.createElement(MobileSignOutTab));
    expect(mobileHtml).toContain("Sign Out");
  });
});
