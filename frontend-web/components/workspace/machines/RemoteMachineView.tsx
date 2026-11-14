"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  refreshRemoteMachineCommands,
  refreshRemoteMachines,
  requestRemoteMachineCommand,
  type RemoteMachine,
  type RemoteMachineCommand,
} from "@/app/branches/[branchId]/machines/actions";

type Role = "owner" | "branch_manager" | "machine_maintenance";
type Tab = "state" | "programs" | "parameters" | "history";

function dateLabel(value: string | null): string {
  if (!value) return "No update";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "Unknown time" : time.toLocaleString("en-MY");
}

function displayState(machine: RemoteMachine): string {
  if (machine.freshness !== "fresh") return "Unknown";
  return machine.state.charAt(0).toUpperCase() + machine.state.slice(1);
}

export function RemoteMachineView({ branchId, branchOpen, role, initialMachines }: {
  branchId: string;
  branchOpen: boolean;
  role: Role;
  initialMachines: RemoteMachine[];
}) {
  const [machines, setMachines] = useState(initialMachines);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("state");
  const [program, setProgram] = useState("standard");
  const [commands, setCommands] = useState<RemoteMachineCommand[]>([]);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = machines.find(machine => machine.source_id === selectedId) ?? null;
  const canControl = branchOpen && !serviceError && !pending && role !== "machine_maintenance" && selected?.freshness === "fresh";

  useEffect(() => {
    if (!selectedId) return;
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      const result = await refreshRemoteMachines(branchId);
      if (!active) return;
      if (result.ok) {
        setMachines(result.value);
        setServiceError(null);
      } else {
        setServiceError(result.message);
      }
      if (selectedId) {
        const history = await refreshRemoteMachineCommands(branchId, selectedId);
        if (active && history.ok) setCommands(history.value);
      }
    }
    const timer = window.setInterval(refresh, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [branchId, selectedId]);

  function open(machine: RemoteMachine) {
    setSelectedId(machine.source_id);
    setProgram("standard");
    setTab("state");
    setActionMessage(null);
  }

  function close() {
    dialog.current?.close();
    setSelectedId(null);
    setCommands([]);
  }

  function send(action: "start" | "pause" | "resume" | "stop" | "set_settings",
                args: Record<string, unknown> = {}) {
    if (!selected || !canControl) return;
    const confirmation = action === "start"
      ? `Start ${program === "quick" ? "Quick" : "Standard"} on ${selected.label}?`
      : `Request ${action} for ${selected.label}?`;
    if ((action === "stop" || action === "start") && !window.confirm(confirmation)) return;
    setActionMessage(null);
    startTransition(async () => {
      const requestId = crypto.randomUUID();
      const result = await requestRemoteMachineCommand(branchId, selected.source_id, requestId, action, args);
      if (!result.ok) {
        setActionMessage(result.message);
        return;
      }
      setActionMessage(`Command ${result.value.status}. Execution is confirmed only after the machine responds.`);
      const history = await refreshRemoteMachineCommands(branchId, selected.source_id);
      if (history.ok) setCommands(history.value);
    });
  }

  const grouped = (["washer", "dryer", "washer_dryer"] as const).map(type => ({
    type, items: machines.filter(machine => machine.type === type),
    title: type === "washer" ? "Washers" : type === "dryer" ? "Dryers" : "Washer and dryer units",
  }));

  return (
    <div className="space-y-6">
      {serviceError && <p role="alert" className="rounded-md border border-warning bg-raised px-5 py-4 text-sm text-ink">{serviceError} Last received machine data is shown; controls are disabled.</p>}
      {!branchOpen && <p className="rounded-md border border-rule bg-surface px-5 py-4 text-sm text-muted">This branch is closed. Machine controls are unavailable.</p>}
      {machines.length === 0 && !serviceError && <p className="rounded-md border border-rule bg-surface px-5 py-4 text-sm text-muted">No approved machines are registered for this branch.</p>}
      {grouped.map(group => group.items.length > 0 && (
        <section key={group.type} className="space-y-4">
          <h2 className="text-base font-semibold text-ink">{group.title}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
            {group.items.map(machine => (
              <article key={machine.source_id} className="rounded-md border border-line bg-surface px-5 py-4 md:p-7">
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-ink">{machine.label}</h3>
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div><dt className="text-xs text-muted">State</dt><dd className="text-sm font-medium text-ink">{displayState(machine)}</dd></div>
                    <div><dt className="text-xs text-muted">Source</dt><dd className="text-sm text-ink">{machine.source === "simulated" ? "Simulator" : machine.source}</dd></div>
                    <div><dt className="text-xs text-muted">Freshness</dt><dd className="text-sm text-ink">{machine.freshness}</dd></div>
                    <div><dt className="text-xs text-muted">Last update</dt><dd className="text-sm text-ink">{dateLabel(machine.last_update)}</dd></div>
                  </dl>
                  <button type="button" onClick={() => open(machine)} className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-control bg-navy px-4 py-2 text-sm font-semibold text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent">View machine</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <dialog ref={dialog} onClose={close} aria-labelledby="remote-machine-title" className="m-auto h-11/12 w-11/12 max-w-none rounded-md border border-control bg-canvas text-ink backdrop:bg-canvas/80">
        {selected && <div className="flex h-full min-w-0 flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-rule px-4 py-4 md:px-6">
            <div className="min-w-0"><h2 id="remote-machine-title" className="text-2xl font-semibold tracking-tight text-ink">{selected.label}</h2><p className="mt-2 text-sm text-muted">{displayState(selected)}</p></div>
            <button type="button" onClick={close} className="min-h-11 min-w-11 rounded-md border border-control bg-navy px-3 text-sm text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent">Close</button>
          </header>
          <nav aria-label="Machine detail sections" className="flex gap-2 overflow-x-auto border-b border-rule px-4 py-2 md:px-6">
            {(["state", "programs", "parameters", "history"] as const).map(item => <button key={item} type="button" aria-current={tab === item ? "page" : undefined} onClick={() => setTab(item)} className={`min-h-11 min-w-11 shrink-0 rounded-md px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent ${tab === item ? "bg-navy-selected text-ink" : "text-muted hover:bg-navy-hover hover:text-ink"}`}>{item === "history" ? "Commands" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            {actionMessage && <p role="status" className="mb-4 rounded-md border border-rule bg-raised px-4 py-3 text-sm text-ink">{actionMessage}</p>}
            {tab === "state" && <div className="space-y-5">
              <dl className="grid grid-cols-1 gap-4 rounded-md border border-rule bg-surface px-5 py-4 sm:grid-cols-2 md:p-7">
                <div><dt className="text-xs text-muted">State</dt><dd className="text-base font-semibold text-ink">{displayState(selected)}</dd></div>
                <div><dt className="text-xs text-muted">Freshness</dt><dd className="text-sm text-ink">{selected.freshness}</dd></div>
                <div><dt className="text-xs text-muted">Time remaining</dt><dd className="text-sm tabular-nums text-ink">{selected.freshness === "fresh" && typeof selected.data?.remaining_seconds === "number" ? `${selected.data.remaining_seconds} seconds` : "Unknown"}</dd></div>
                <div><dt className="text-xs text-muted">Last update</dt><dd className="text-sm text-ink">{dateLabel(selected.last_update)}</dd></div>
                {selected.data?.fault_code && <div><dt className="text-xs text-muted">Fault</dt><dd className="text-sm text-negative">{selected.data.fault_code}</dd></div>}
              </dl>
              {role !== "machine_maintenance" && <div className="space-y-4">
                <label className="block max-w-sm text-sm text-ink">Program for START
                  <select value={program} onChange={event => setProgram(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-control bg-raised px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"><option value="standard">Standard</option><option value="quick">Quick</option></select>
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {(["start", "pause", "resume", "stop"] as const).map(action => <button key={action} type="button" disabled={!canControl || (action === "start" ? selected.state !== "idle" : action === "pause" ? selected.state !== "running" : action === "resume" ? selected.state !== "paused" : !["running", "paused"].includes(selected.state))} onClick={() => send(action, action === "start" ? { program_id: program } : {})} className="min-h-11 min-w-11 rounded-md border border-control bg-navy px-5 py-2 text-sm font-semibold uppercase text-ink enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted">{action}</button>)}
                </div>
              </div>}
            </div>}
            {tab === "programs" && <div className="space-y-4">
              <h3 className="text-base font-semibold text-ink">Saved programs</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Object.entries(selected.data?.programs ?? {}).map(([id, settings]) => <div key={id} className="rounded-md border border-rule bg-surface px-5 py-4">
                  <h4 className="text-sm font-semibold text-ink">{id === "quick" ? "Quick" : id === "standard" ? "Standard" : id}</h4>
                  <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div><dt className="text-xs text-muted">Duration</dt><dd className="text-sm text-ink">{String(settings.duration_seconds ?? "Unknown")} seconds</dd></div>
                    {role !== "machine_maintenance" && <div><dt className="text-xs text-muted">Cycle rate</dt><dd className="text-sm text-ink">RM {String(settings.price_myr ?? "Unknown")}</dd></div>}
                  </dl>
                </div>)}
              </div>
              {Object.keys(selected.data?.programs ?? {}).length === 0 && <p className="text-sm text-muted">No verified program data is available.</p>}
            </div>}
            {tab === "parameters" && <div className="space-y-4"><h3 className="text-base font-semibold text-ink">Current settings</h3><dl className="grid grid-cols-1 gap-4 rounded-md border border-rule bg-surface px-5 py-4 sm:grid-cols-2 md:p-7">{Object.entries(selected.data?.settings ?? {}).filter(([key]) => role !== "machine_maintenance" || key !== "price_myr").map(([key, value]) => <div key={key}><dt className="text-xs text-muted">{key.replaceAll("_", " ")}</dt><dd className="text-sm text-ink">{String(value)}</dd></div>)}</dl>
              {role !== "machine_maintenance" && selected.type === "washer" && <form key={`${selected.source_id}-${program}`} onSubmit={event => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                send("set_settings", {
                  program_id: program,
                  price_myr: String(form.get("price_myr")),
                  duration_seconds: Number(form.get("duration_seconds")),
                  target_temperature_c: Number(form.get("target_temperature_c")),
                  water_level: String(form.get("water_level")),
                  spin_rpm: Number(form.get("spin_rpm")),
                });
              }} className="space-y-4 rounded-md border border-rule bg-surface px-5 py-4 md:p-7">
                <h4 className="text-base font-semibold text-ink">Edit saved program</h4>
                <label className="block text-sm text-ink">Program<select value={program} onChange={event => setProgram(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-control bg-raised px-3 text-ink focus-visible:outline-2 focus-visible:outline-accent"><option value="standard">Standard</option><option value="quick">Quick</option></select></label>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {([['price_myr', 'Cycle rate (RM)', '0', '999', '0.01'], ['duration_seconds', 'Duration (seconds)', '1', '7200', '1'], ['target_temperature_c', 'Target temperature (°C)', '0', '90', '1'], ['spin_rpm', 'Spin speed (RPM)', '0', '1200', '1']] as const).map(([name, label, min, max, step]) => <label key={name} className="block text-sm text-ink">{label}<input name={name} type="number" required min={min} max={max} step={step} defaultValue={String(selected.data?.programs?.[program]?.[name] ?? '')} className="mt-2 min-h-11 w-full rounded-md border border-control bg-raised px-3 text-ink focus-visible:outline-2 focus-visible:outline-accent" /></label>)}
                  <label className="block text-sm text-ink">Water level<select name="water_level" defaultValue={String(selected.data?.programs?.[program]?.water_level ?? 'medium')} className="mt-2 min-h-11 w-full rounded-md border border-control bg-raised px-3 text-ink focus-visible:outline-2 focus-visible:outline-accent"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                </div>
                <button type="submit" disabled={!canControl || selected.state !== "idle"} className="min-h-11 min-w-11 rounded-md border border-ink bg-ink px-5 py-2 text-sm font-semibold text-surface focus-visible:outline-2 focus-visible:outline-accent disabled:border-control disabled:bg-raised disabled:text-muted">Save settings</button>
              </form>}
              <p className="text-sm text-muted">Advanced vendor parameters are unavailable until a verified provider contract exists.</p>
            </div>}
            {tab === "history" && <div className="space-y-4"><h3 className="text-base font-semibold text-ink">Recent commands</h3>{commands.length === 0 ? <p className="text-sm text-muted">No recorded commands for this machine.</p> : <div className="space-y-3">{commands.map(command => <div key={command.command_id} className="grid grid-cols-1 gap-3 rounded-md border border-rule bg-surface px-5 py-4 sm:grid-cols-3"><div><p className="text-xs text-muted">Action</p><p className="text-sm text-ink">{command.action}</p></div><div><p className="text-xs text-muted">Outcome</p><p className="text-sm text-ink">{command.status}</p></div><div><p className="text-xs text-muted">Issued</p><p className="text-sm text-ink">{dateLabel(command.issued_at)}</p></div>{command.reason && <p className="text-sm text-negative sm:col-span-3">{command.reason}</p>}</div>)}</div>}</div>}
          </div>
        </div>}
      </dialog>
    </div>
  );
}
