import { expect, test } from "@playwright/test";

test("minimal landing links to dedicated login and account selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your laundry, in view." })).toBeVisible();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email address")).toBeEmpty();
  await expect(page.getByLabel("Password", { exact: true })).toBeEmpty();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByRole("link", { name: /I’m an owner/ }).click();
  await expect(page).toHaveURL(/\/register\/owner$/);
  await expect(page.getByLabel("Organization name")).toBeVisible();
});

test("mismatched signup passwords show linked errors and preserve entered details", async ({ page }) => {
  await page.goto("/register/owner");
  await page.getByLabel("Full name").fill("Aina Rahman");
  await page.getByLabel("Email address").fill("aina@example.test");
  await page.getByLabel("Phone number").fill("+60 12 345 6789");
  await page.getByLabel("Organization name").fill("Aina Laundry");
  await page.getByLabel("Password", { exact: true }).fill("Test-password-42");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Passwords do not match.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Full name")).toHaveValue("Aina Rahman");
  await expect(page).toHaveURL(/\/register\/owner$/);
});

test("unavailable organization directory cannot become a fixture signup", async ({ page }) => {
  await page.goto("/register/personnel");
  await expect(page.getByText("The organization directory is unavailable right now.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Organization", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
});

test("forged localStorage tokens cannot open either legacy route", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("msu_auth_token", "forged-demo-token");
    localStorage.setItem("msu_operator_name", "Owner");
  });
  for (const path of ["/branches", "/dashboard"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole("heading", { name: "Good to see you again" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("msu_auth_token"))).toBeNull();
    await expect(page.getByText("Launch Operations Portal", { exact: true })).toHaveCount(0);
  }
});

test("invalid callbacks strip tokens and reject external destinations", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=do-not-retain&type=recovery&next=https://outside.example.test");
  await expect(page).toHaveURL("http://localhost:3100/check-email?confirmation=invalid");
  await expect(page.getByRole("alert")).toContainText("invalid or has already been used");
  await page.goto("/login?next=https://outside.example.test");
  await expect(page.locator('input[name="next"]')).toHaveCount(0);
});

test("keyboard entry and constrained layouts remain usable", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByLabel("Email address").focus();
  await expect(page.getByLabel("Email address")).toBeFocused();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
