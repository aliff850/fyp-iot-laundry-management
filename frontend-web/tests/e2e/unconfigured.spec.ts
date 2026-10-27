import { expect, test } from "@playwright/test";

test("public entry remains usable without Supabase configuration", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Register", exact: true }).click();
  await expect(page.getByRole("link", { name: /I’m an owner/ })).toBeVisible();
});

test("unconfigured login and signup cannot submit or produce a session", async ({ page }) => {
  for (const [route, action] of [["/login", "Log in"], ["/register/owner", "Create account"]]) {
    await page.goto(route);
    await expect(page.getByRole("status")).toContainText("Authentication is temporarily unavailable");
    await expect(page.getByRole("button", { name: action, exact: true })).toBeDisabled();
  }
  await page.goto("/membership-status");
  await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
});
