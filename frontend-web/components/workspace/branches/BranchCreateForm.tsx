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
    primary_manager_user_id: managers.find(m => m.role === "owner")?.user_id ?? "",
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
    if (state.success) router.push("/branches");
  }, [state.success, router]);

  const field = (name: keyof typeof values, label: string, required = true, type = "text") => (
    <label className="grid gap-1 text-sm text-muted">
      {label}
      <input
        name={name}
        value={values[name]}
        onChange={event => setValues(v => ({ ...v, [name]: event.target.value }))}
        required={required}
        type={type}
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
      className="mt-7 space-y-6"
      aria-busy={pending}
    >
      <input type="hidden" name="request_id" value={requestId} />

      <ol className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Branch setup steps">
        <li aria-current={step === 0 ? "step" : undefined} className={step === 0 ? "font-semibold text-ink" : ""}>
          1 · Details and location
        </li>
        <li aria-current={step === 1 ? "step" : undefined} className={step === 1 ? "font-semibold text-ink" : ""}>
          2 · Primary manager
        </li>
        <li aria-current={step === 2 ? "step" : undefined} className={step === 2 ? "font-semibold text-ink" : ""}>
          3 · Review
        </li>
      </ol>

      <section className="rounded-md border border-line bg-surface px-5 py-4 md:p-7">
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">{field("name", "Branch name")}</div>
            <div className="md:col-span-2">{field("address", "Street address")}</div>
            {field("city", "City")}
            {field("region", "State or region")}
            {field("postal_code", "Postal code")}
            {field("contact_phone", "Contact phone", true, "tel")}

            <div className="md:col-span-2 space-y-3 rounded-lg border border-line bg-canvas/40 p-4">
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

              <div className="space-y-1.5">
                <span className="text-xs text-muted">Quick presets:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggle24Hours(true)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      is24Hours
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-control bg-surface text-ink hover:bg-navy-hover"
                    }`}
                  >
                    24 Hours / Always Open
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTimeChange("07:00", "23:00")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      !is24Hours && values.opening_hours === "07:00 - 23:00"
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-control bg-surface text-ink hover:bg-navy-hover"
                    }`}
                  >
                    07:00 - 23:00 (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTimeChange("06:00", "00:00")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      !is24Hours && values.opening_hours === "06:00 - 00:00"
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-control bg-surface text-ink hover:bg-navy-hover"
                    }`}
                  >
                    06:00 - 00:00 (Late Night)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTimeChange("08:00", "22:00")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      !is24Hours && values.opening_hours === "08:00 - 22:00"
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-control bg-surface text-ink hover:bg-navy-hover"
                    }`}
                  >
                    08:00 - 22:00 (Mall Hours)
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted hover:text-ink">
                <input
                  type="checkbox"
                  checked={is24Hours}
                  onChange={e => handleToggle24Hours(e.target.checked)}
                  className="size-4 rounded border-control bg-canvas text-accent focus:ring-accent focus:ring-offset-surface"
                />
                <span>Branch operates 24 hours daily (always open)</span>
              </label>

              {!is24Hours ? (
                <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-rule">
                  <label className="grid gap-1 text-xs text-muted">
                    Opening time
                    <input
                      type="time"
                      value={openTime}
                      onChange={e => handleTimeChange(e.target.value, closeTime)}
                      required
                      className={inputClass}
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-muted">
                    Closing time
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
                <div className="rounded-md border border-rule bg-surface/60 px-3 py-2 text-xs text-muted">
                  Operating 24/7. Continuous machine availability without scheduled closing.
                </div>
              )}

              <input type="hidden" name="opening_hours" value={values.opening_hours} />
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
          <div>
            <h2 className="text-base font-semibold text-ink">Primary manager</h2>
            <p className="mt-2 text-sm text-muted">
              The organization owner is selected by default. Approved branch managers and personnel without operational roles are eligible.
            </p>
            <label className="mt-5 grid gap-2 text-sm text-muted">
              Manager
              <select
                name="primary_manager_user_id"
                value={values.primary_manager_user_id}
                onChange={event => setValues(v => ({ ...v, primary_manager_user_id: event.target.value }))}
                className={inputClass}
              >
                {managers.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name} · {m.role === "owner" ? "Owner" : m.role === "branch_manager" ? "Branch manager" : "Eligible (Unassigned)"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-base font-semibold text-ink">Review branch</h2>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <dt className="text-muted">Name</dt>
              <dd className="font-medium text-ink">{values.name}</dd>
              <dt className="text-muted">Address</dt>
              <dd className="font-medium text-ink">
                {values.address}, {values.city}, {values.region} {values.postal_code}
              </dd>
              <dt className="text-muted">Contact</dt>
              <dd className="font-medium text-ink">{values.contact_phone}</dd>
              <dt className="text-muted">Hours</dt>
              <dd className="font-medium text-ink">{values.opening_hours}</dd>
              <dt className="text-muted">Map Coordinates</dt>
              <dd className="font-medium text-ink">
                {values.latitude && values.longitude ? (
                  <span className="text-xs tabular-nums">{values.latitude}, {values.longitude}</span>
                ) : (
                  <span className="text-faint">No map pin set</span>
                )}
              </dd>
              <dt className="text-muted">Primary manager</dt>
              <dd className="font-medium text-ink">
                {managers.find(m => m.user_id === values.primary_manager_user_id)?.full_name}
              </dd>
            </dl>
            <p className="mt-5 text-xs text-muted">
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

      <div className="flex flex-wrap gap-3">
        <Link href="/branches" className={textLink}>
          Cancel
        </Link>
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
              if (
                step === 0 &&
                (!values.name.trim() ||
                  !values.address.trim() ||
                  !values.city.trim() ||
                  !values.region.trim() ||
                  !values.postal_code.trim() ||
                  !values.contact_phone.trim() ||
                  !values.opening_hours.trim() ||
                  Boolean(values.latitude) !== Boolean(values.longitude))
              ) {
                setValidationMessage("Complete the required details and enter both coordinates or neither.");
                return;
              }
              if (step === 0 && !requestId) setRequestId(crypto.randomUUID());
              if (step === 1 && !values.primary_manager_user_id) return;
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
    </form>
  );
}
