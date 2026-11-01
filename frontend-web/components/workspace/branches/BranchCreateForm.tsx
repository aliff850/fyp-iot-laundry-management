"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { createWorkspaceBranch } from "@/app/branches/new/actions";
import { Notice } from "@/components/auth/AuthForm";
import { BranchLocationPicker } from "@/components/workspace/branches/BranchLocationPicker";
import { inputClass, primaryButton, secondaryButton, textLink } from "@/lib/auth/styles";
import type { ManagerOption } from "@/lib/auth/business";

export function BranchCreateForm({ managers }: { managers: ManagerOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [is24Hours, setIs24Hours] = useState(false);
  const [openTime, setOpenTime] = useState("07:00");
  const [closeTime, setCloseTime] = useState("23:00");
  const [values, setValues] = useState({
    name: "",
    address: "",
    city: "",
    region: "",
    postal_code: "",
    contact_phone: "",
    opening_hours: "07:00 - 23:00",
    latitude: "",
    longitude: "",
    primary_manager_user_id: managers.find(m => m.role === "owner")?.user_id ?? managers[0]?.user_id ?? "",
  });
  const [state, action, pending] = useActionState(createWorkspaceBranch, {});

  const handleToggle24Hours = (checked: boolean) => {
    setIs24Hours(checked);
    if (checked) {
      setValues(v => ({ ...v, opening_hours: "24 Hours" }));
    } else {
      setValues(v => ({ ...v, opening_hours: `${openTime} - ${closeTime}` }));
    }
  };

  const handleTimeChange = (newOpen: string, newClose: string) => {
    setOpenTime(newOpen);
    setCloseTime(newClose);
    setIs24Hours(false);
    setValues(v => ({ ...v, opening_hours: `${newOpen} - ${newClose}` }));
  };

  useEffect(() => {
    if (state.success && state.branchId) {
      router.push(`/branches/${state.branchId}/hardware-setup`);
    } else if (state.success) {
      router.push("/branches");
    }
  }, [state.success, state.branchId, router]);

  const field = (
    name: keyof typeof values,
    label: string,
    required = true,
    type = "text",
    maxLength?: number,
    pattern?: string,
    placeholder?: string
  ) => (
    <label className="grid gap-1.5 text-xs sm:text-sm font-medium text-muted">
      <span>{label}</span>
      <input
        name={name}
        value={values[name]}
        onChange={event => setValues(v => ({ ...v, [name]: event.target.value }))}
        required={required}
        type={type}
        maxLength={maxLength}
        pattern={pattern}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );

  return (
    <form
      action={action}
      onSubmit={event => {
        if (step !== 2) event.preventDefault();
      }}
      className="mx-auto max-w-3xl mt-7 space-y-6"
      aria-busy={pending}
    >
      <input type="hidden" name="request_id" value={requestId} />

      <ol className="flex flex-wrap items-center gap-3 text-xs text-muted" aria-label="Branch setup steps">
        <li aria-current={step === 0 ? "step" : undefined} className={step === 0 ? "font-semibold text-ink" : ""}>
          1. Details and location
        </li>
        <li aria-current={step === 1 ? "step" : undefined} className={step === 1 ? "font-semibold text-ink" : ""}>
          2. Primary manager
        </li>
        <li aria-current={step === 2 ? "step" : undefined} className={step === 2 ? "font-semibold text-ink" : ""}>
          3. Review
        </li>
      </ol>

      <section className="rounded-md border border-line bg-surface p-5 md:p-6">
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">{field("name", "Branch name", true, "text", 120, undefined, "e.g., MSU Shah Alam")}</div>
            <div className="md:col-span-2">{field("address", "Street address", true, "text", 240, undefined, "e.g., Persiaran Sukan, Seksyen 13")}</div>
            {field("city", "City", true, "text", 100, undefined, "e.g., Shah Alam")}
            {field("region", "State or region", true, "text", 100, undefined, "e.g., Selangor")}
            {field("postal_code", "Postal code", true, "text", 20, undefined, "e.g., 40100")}
            {field("contact_phone", "Contact phone", true, "tel", 32, "^[+()0-9 .-]+$", "e.g., +60123456789")}

            {/* Opening Hours Section: 24 Hours / Always Open Toggle with Custom Fallback */}
            <div className="md:col-span-2 space-y-3.5 rounded-md border border-line bg-canvas/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-accent" aria-hidden="true" />
                  <span className="text-sm font-medium text-ink">Opening Hours</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-rule bg-surface px-2.5 py-1 text-xs text-muted">
                  <span>Selected:</span>
                  <span className="font-semibold text-accent">{values.opening_hours || "Not set"}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* 24 Hours Option Toggle Button */}
                <div>
                  <button
                    type="button"
                    aria-pressed={is24Hours}
                    onClick={() => handleToggle24Hours(!is24Hours)}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2 text-xs sm:text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${is24Hours
                      ? "border-accent bg-accent/15 text-ink font-semibold"
                      : "border-control bg-surface text-muted hover:border-ink hover:text-ink hover:bg-raised"
                      }`}
                  >
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    <span>24 Hours / Always Open</span>
                  </button>
                </div>

                {/* Custom Time Inputs or 24/7 Notice */}
                {!is24Hours ? (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-rule">
                    <label className="grid gap-1.5 text-xs sm:text-sm font-medium text-muted">
                      <span>Opening time</span>
                      <input
                        type="time"
                        value={openTime}
                        onChange={e => handleTimeChange(e.target.value, closeTime)}
                        required
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs sm:text-sm font-medium text-muted">
                      <span>Closing time</span>
                      <input
                        type="time"
                        value={closeTime}
                        onChange={e => handleTimeChange(openTime, e.target.value)}
                        required
                        className={inputClass}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-md border border-rule bg-surface/60 px-3.5 py-2.5 text-xs text-muted">
                    Operating 24/7 continuous laundry machine availability without scheduled closing.
                  </div>
                )}

                <input type="hidden" name="opening_hours" value={values.opening_hours} />
              </div>
            </div>

            <div className="md:col-span-2 space-y-3 pt-3 border-t border-rule">
              <div>
                <h2 className="text-base font-semibold text-ink">Branch Map Location</h2>
                <p className="mt-1 text-xs text-muted">
                  Use the interactive map to pin coordinates for customer navigation and overview. Map defaults to Malaysia.
                </p>
              </div>

              <BranchLocationPicker
                latitude={values.latitude}
                longitude={values.longitude}
                onChange={(lat, lng) => setValues(v => ({ ...v, latitude: lat, longitude: lng }))}
              />
              <input type="hidden" name="latitude" value={values.latitude} />
              <input type="hidden" name="longitude" value={values.longitude} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Primary manager</h2>
              <p className="mt-1 text-sm text-muted">
                The organization owner is selected by default. Approved branch managers (including those assigned to other branches) and unassigned personnel are eligible.
              </p>
            </div>
            {managers.length === 0 ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                No eligible managers found in this organization.
              </p>
            ) : (
              <label className="grid gap-1.5 text-xs sm:text-sm font-medium text-muted">
                <span>Manager</span>
                <select
                  name="primary_manager_user_id"
                  value={values.primary_manager_user_id}
                  onChange={event => setValues(v => ({ ...v, primary_manager_user_id: event.target.value }))}
                  className={inputClass}
                >
                  {managers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name} ({m.role === "owner" ? "Owner" : m.role === "branch_manager" ? "Branch manager" : "Eligible (Unassigned)"})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Review branch</h2>
              <p className="mt-1 text-sm text-muted">
                Verify location information and assigned manager before creating this branch.
              </p>
            </div>
            <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 rounded-md border border-rule bg-raised/30 p-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Name</dt>
                <dd className="mt-0.5 font-semibold text-ink">{values.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Contact</dt>
                <dd className="mt-0.5 font-semibold text-ink tabular-nums">{values.contact_phone}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Address</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {values.address}, {values.city}, {values.region} {values.postal_code}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Hours</dt>
                <dd className="mt-0.5 font-semibold text-ink">{values.opening_hours}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Map coordinates</dt>
                <dd className="mt-0.5 font-semibold text-ink tabular-nums">
                  {values.latitude && values.longitude ? (
                    `${values.latitude}, ${values.longitude}`
                  ) : (
                    <span className="text-muted font-normal">Location not set</span>
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2 border-t border-rule pt-2.5">
                <dt className="text-xs text-muted">Primary manager</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {managers.find(m => m.user_id === values.primary_manager_user_id)?.full_name || "Unassigned"}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted">
              The branch begins closed to customers. Publishing and device setup follow later.
            </p>
          </div>
        )}
      </section>

      {step === 2 &&
        Object.entries(values).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      {validationMessage && <Notice kind="error">{validationMessage}</Notice>}
      {state.message && <Notice kind={state.success ? "success" : "error"}>{state.message}</Notice>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <Link href="/branches" className={textLink}>
          Cancel
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {step > 0 && (
            <button type="button" className={secondaryButton} onClick={() => setStep(s => s - 1)}>
              Back
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                if (step === 0) {
                  if (
                    !values.name.trim() ||
                    !values.address.trim() ||
                    !values.city.trim() ||
                    !values.region.trim() ||
                    !values.postal_code.trim() ||
                    !values.contact_phone.trim() ||
                    !values.opening_hours.trim() ||
                    Boolean(values.latitude) !== Boolean(values.longitude)
                  ) {
                    setValidationMessage("Complete the required details and enter both coordinates or neither.");
                    return;
                  }
                  const phone = values.contact_phone.trim();
                  if (phone.length < 7 || phone.length > 32 || !/^[+()0-9 .-]+$/.test(phone)) {
                    setValidationMessage("Enter a valid contact phone number (7 to 32 digits, symbols + ( ) - . allowed).");
                    return;
                  }
                  if (!requestId) setRequestId(crypto.randomUUID());
                }
                if (step === 1) {
                  if (!values.primary_manager_user_id) {
                    setValidationMessage("Select an eligible manager for this branch.");
                    return;
                  }
                }
                setValidationMessage("");
                setStep(s => s + 1);
              }}
            >
              Continue
            </button>
          ) : (
            <button type="submit" disabled={pending || !requestId} className={primaryButton}>
              {pending ? "Creating…" : "Create branch"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
