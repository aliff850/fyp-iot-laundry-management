import { describe, expect, it } from "vitest";
import { activeDestination, safeReturnTo } from "@/lib/auth/redirects";
import { validateLogin, validateRegistration } from "@/lib/auth/validation";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";

function fields(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Aina Rahman", email: "aina@example.test", phone: "+60 12 345 6789", password: "Test-password-42", confirmPassword: "Test-password-42", organizationName: "Aina Laundry", ...overrides })) form.set(key, value);
  return form;
}

describe("authentication input boundaries", () => {
  it("rejects mismatched passwords before calling an identity provider", () => {
    const result = validateRegistration(fields({ confirmPassword: "different" }), "owner");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.confirmPassword).toBeTruthy();
  });

  it("keeps owner registration intent unprivileged and never retains password confirmation", () => {
    const form = fields();
    form.set("role", "owner");
    form.set("app_metadata", '{"role":"owner"}');
    const result = validateRegistration(form, "owner");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata).toEqual({ full_name: "Aina Rahman", phone: "+60 12 345 6789", onboarding_intent: { kind: "owner", organization_name: "Aina Laundry" } });
      expect(JSON.stringify(result.value.metadata)).not.toContain("password");
      expect(result.value).not.toHaveProperty("confirmPassword");
    }
  });

  it("requires a personnel organization ID and rejects an invented registration kind", () => {
    expect(validateRegistration(fields(), "personnel").ok).toBe(false);
    expect(validateRegistration(fields(), "administrator").ok).toBe(false);
  });

  it("validates login email and preserves password whitespace", () => {
    expect(validateLogin(fields({ email: "admin" })).ok).toBe(false);
    const result = validateLogin(fields({ password: "  spaced password  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.password).toBe("  spaced password  ");
  });

  it("bounds all personal fields and rejects non-string form entries", () => {
    expect(validateRegistration(fields({ name: "a".repeat(101) }), "owner").ok).toBe(false);
    const form = fields();
    form.set("email", new Blob(["not an email"]), "email.txt");
    expect(validateLogin(form).ok).toBe(false);
  });
});

describe("safe return destinations", () => {
  it.each(["https://example.test", "//example.test", "/\\example.test", "/%2f%2fexample.test", "/branches/../../login", "/login", "/auth/confirm?token_hash=secret", "/branches/%0aLocation:bad"])("rejects %s", (value) => {
    expect(safeReturnTo(value)).toBeNull();
  });

  it("preserves an internal incident destination without granting access to it", () => {
    expect(safeReturnTo("/branches/branch-a/incidents/incident-a?tab=history")).toBe("/branches/branch-a/incidents/incident-a?tab=history");
    expect(activeDestination("/branches/branch-a/incidents/incident-a?tab=history", "owner")).toBe("/branches");
    expect(activeDestination("/branches/new", "owner")).toBe("/branches/new");
    expect(activeDestination("/branches/new", "branch_manager")).toBe("/branches");
    expect(activeDestination("//evil.example", "owner")).toBe("/branches");
  });
});

describe("public project configuration", () => {
  it("fails closed for absent or invalid public configuration", () => {
    expect(getAuthConfig({})).toBeNull();
    expect(getAuthConfig({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key" })).toBeNull();
  });

  it("uses a development-only localhost origin and requires trusted production configuration", () => {
    expect(getSiteUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(getSiteUrl({ NODE_ENV: "production" })).toBeNull();
    expect(getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://laundry.example.test/path" })).toBeNull();
    expect(getSiteUrl({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://laundry.example.test" })).toBe("https://laundry.example.test");
  });
});
