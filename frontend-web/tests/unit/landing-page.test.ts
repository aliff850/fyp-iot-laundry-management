import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import LandingPage from "@/app/page";

describe("LandingPage component", () => {
  it("renders centered heading, tagline, and call-to-action buttons with mobile-first styling", () => {
    const raw = renderToString(React.createElement(LandingPage));
    const text = raw.replace(/<!--.*?-->/g, "");

    // 1. Text contents
    expect(text).toContain("Your laundry,");
    expect(text).toContain("in view.");
    expect(text).toContain("Monitor machines, track fuel and respond to incidents across your branches.");
    expect(text).toContain("Log in");
    expect(text).toContain("Register");

    // 2. Centering classes
    expect(raw).toContain("justify-center");
    expect(raw).toContain("items-center");
    expect(raw).toContain("text-center");
    expect(raw).toContain("mx-auto");

    // 3. Mobile-friendly responsive buttons (full width stacked on mobile, row on sm+)
    expect(raw).toContain('href="/login"');
    expect(raw).toContain('href="/register"');
    expect(raw).toContain("w-full sm:w-auto");
    expect(raw).toMatch(/<a[^>]*min-h-11[^>]*href="\/login"/);
    expect(raw).toMatch(/<a[^>]*min-h-11[^>]*href="\/register"/);

    // 4. No prohibited middle dots
    expect(raw).not.toContain("·");
  });
});
