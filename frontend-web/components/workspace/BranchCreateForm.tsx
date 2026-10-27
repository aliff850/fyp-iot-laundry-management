"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createWorkspaceBranch } from "@/app/branches/new/actions";
import { Notice } from "@/components/auth/AuthForm";
import { inputClass, primaryButton, secondaryButton, textLink } from "@/lib/auth/styles";
import type { ManagerOption } from "@/lib/auth/business";

export function BranchCreateForm({ managers }: { managers: ManagerOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [values, setValues] = useState({ name: "", address: "", city: "", region: "", postal_code: "", contact_phone: "", opening_hours: "", latitude: "", longitude: "", primary_manager_user_id: managers.find(m => m.role === "owner")?.user_id ?? "" });
  const [state, action, pending] = useActionState(createWorkspaceBranch, {});
  useEffect(() => { if (state.success) router.push("/branches"); }, [state.success, router]);
  const field = (name: keyof typeof values, label: string, required = true, type = "text") => <label className="grid gap-1 text-sm text-muted">{label}<input name={name} value={values[name]} onChange={event => setValues(v => ({ ...v, [name]: event.target.value }))} required={required} type={type} step={type === "number" ? "any" : undefined} className={inputClass} /></label>;
  return <form action={action} onSubmit={event => { if (step !== 2) event.preventDefault(); }} className="mt-7 space-y-6" aria-busy={pending}>
    <input type="hidden" name="request_id" value={requestId} />
    <ol className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Branch setup steps"><li aria-current={step === 0 ? "step" : undefined}>1 · Details and location</li><li aria-current={step === 1 ? "step" : undefined}>2 · Primary manager</li><li aria-current={step === 2 ? "step" : undefined}>3 · Review</li></ol>
    <section className="rounded-md border border-line bg-surface px-5 py-4 md:p-7">
      {step === 0 && <div className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2">{field("name", "Branch name")}</div><div className="md:col-span-2">{field("address", "Street address")}</div>{field("city", "City")}{field("region", "State or region")}{field("postal_code", "Postal code")}{field("contact_phone", "Contact phone", true, "tel")}{field("opening_hours", "Opening hours")}
        <div className="md:col-span-2"><h2 className="text-base font-semibold text-ink">Map location</h2><p className="mt-1 text-xs text-muted">Enter both coordinates if known. You can create the branch without a map pin.</p></div>{field("latitude", "Latitude", false, "number")}{field("longitude", "Longitude", false, "number")}</div>}
      {step === 1 && <div><h2 className="text-base font-semibold">Primary manager</h2><p className="mt-2 text-sm text-muted">The organization owner is selected by default. Only approved branch managers are eligible alternatives.</p><label className="mt-5 grid gap-2 text-sm text-muted">Manager<select name="primary_manager_user_id" value={values.primary_manager_user_id} onChange={event => setValues(v => ({ ...v, primary_manager_user_id: event.target.value }))} className={inputClass}>{managers.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name} · {m.role === "owner" ? "Owner" : "Branch manager"}</option>)}</select></label></div>}
      {step === 2 && <div><h2 className="text-base font-semibold">Review branch</h2><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><dt className="text-muted">Name</dt><dd>{values.name}</dd><dt className="text-muted">Address</dt><dd>{values.address}, {values.city}, {values.region} {values.postal_code}</dd><dt className="text-muted">Contact</dt><dd>{values.contact_phone}</dd><dt className="text-muted">Hours</dt><dd>{values.opening_hours}</dd><dt className="text-muted">Map</dt><dd>{values.latitude && values.longitude ? values.latitude + ", " + values.longitude : "No pin yet"}</dd><dt className="text-muted">Primary manager</dt><dd>{managers.find(m => m.user_id === values.primary_manager_user_id)?.full_name}</dd></dl><p className="mt-5 text-xs text-muted">The branch begins closed to customers. Publishing and device setup follow later.</p></div>}
    </section>
    {step === 2 && Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {validationMessage && <Notice kind="error">{validationMessage}</Notice>}
    {state.message && <Notice kind={state.success ? "success" : "error"}>{state.message}</Notice>}
    <div className="flex flex-wrap gap-3"><Link href="/branches" className={textLink}>Cancel</Link>{step > 0 && <button type="button" className={secondaryButton} onClick={() => setStep(s => s - 1)}>Back</button>}{step < 2 ? <button type="button" className={primaryButton} onClick={() => {
      if (step === 0 && (!values.name.trim() || !values.address.trim() || !values.city.trim() || !values.region.trim() || !values.postal_code.trim() || !values.contact_phone.trim() || !values.opening_hours.trim() || Boolean(values.latitude) !== Boolean(values.longitude))) { setValidationMessage("Complete the required details and enter both coordinates or neither."); return; }
      if (step === 0 && !requestId) setRequestId(crypto.randomUUID());
      if (step === 1 && !values.primary_manager_user_id) return;
      setValidationMessage("");
      setStep(s => s + 1);
    }}>Continue</button> : <button type="submit" disabled={pending || !requestId} className={primaryButton}>{pending ? "Creating…" : "Create branch"}</button>}</div>
  </form>;
}
