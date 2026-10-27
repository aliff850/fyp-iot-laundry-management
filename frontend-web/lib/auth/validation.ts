export type FieldErrors = Partial<Record<string, string>>;
export type AuthFormState = { status?: "error" | "success"; message?: string; fieldErrors?: FieldErrors };
type Validation<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

function text(form: FormData, key: string, trim = true): string {
  const value = form.get(key);
  return typeof value === "string" ? (trim ? value.trim() : value) : "";
}

export function validateLogin(form: FormData): Validation<{ email: string; password: string }> {
  const email = text(form, "email");
  const password = text(form, "password", false);
  const errors: FieldErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
  if (!password || password.length > 128) errors.password = "Enter your password (up to 128 characters).";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { email, password } };
}

type Registration = {
  email: string;
  password: string;
  metadata: {
    full_name: string;
    phone: string;
    onboarding_intent: { kind: "owner"; organization_name: string } | { kind: "personnel"; organization_id: string };
  };
};

export function validateRegistration(form: FormData, kind: unknown): Validation<Registration> {
  const login = validateLogin(form);
  const errors: FieldErrors = login.ok ? {} : { ...login.errors };
  const name = text(form, "name");
  const phone = text(form, "phone");
  const password = text(form, "password", false);
  const organizationName = text(form, "organizationName");
  const organizationId = text(form, "organizationId");
  if (name.length < 2 || name.length > 100) errors.name = "Enter your full name (2–100 characters).";
  if (!/^[+()0-9 .-]{7,32}$/.test(phone)) errors.phone = "Enter a phone number, including its country or area code.";
  if (password.length < 8 || password.length > 128) errors.password = "Use 8–128 characters. Your organization may require a stronger password.";
  if (password !== text(form, "confirmPassword", false)) errors.confirmPassword = "Passwords do not match.";
  if (kind === "owner" && (!organizationName || organizationName.length > 120)) errors.organizationName = "Enter an organization name (up to 120 characters).";
  if (kind === "personnel" && (!organizationId || organizationId.length > 128)) errors.organizationId = "Select an available organization.";
  if (kind !== "owner" && kind !== "personnel") errors.kind = "Choose owner or personnel registration.";
  if (!login.ok || Object.keys(errors).length || (kind !== "owner" && kind !== "personnel")) return { ok: false, errors };
  return { ok: true, value: { ...login.value, metadata: {
    full_name: name, phone,
    onboarding_intent: kind === "owner" ? { kind, organization_name: organizationName } : { kind, organization_id: organizationId },
  } } };
}
