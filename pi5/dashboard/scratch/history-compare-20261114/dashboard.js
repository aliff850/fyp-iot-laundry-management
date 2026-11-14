const byId = id => document.getElementById(id);
const page = document.body.dataset.page;
const SVG_NS = "http://www.w3.org/2000/svg";

const number = (value, digits = 0) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : "—";

const dateLabel = value => {
  const stamp = typeof value === "string" ? new Date(value) : null;
  return stamp && !Number.isNaN(stamp.getTime()) ? stamp.toLocaleString() : "Time unknown";
};

const text = (tag, className, value = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== "" && value !== null && value !== undefined) element.textContent = value;
  return element;
};

const svgEl = (tag, attrs = {}, className = "") => {
  const element = typeof document.createElementNS === "function"
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  if (className) element.setAttribute("class", className);
  for (const [key, val] of Object.entries(attrs)) {
    if (val !== undefined && val !== null) element.setAttribute(key, String(val));
  }
  return element;
};

const empty = message => text(
  "p",
  "rounded-md border border-line bg-surface px-5 py-4 text-sm text-muted md:p-7",
  message,
);

const metric = (label, value, unit = "", digits = 0) => {
  const box = text("div", "min-w-0 rounded-md border border-rule bg-raised/40 p-4", "");
  box.append(
    text("dt", "text-xs text-muted", label),
    text("dd", "mt-2 break-words text-2xl font-semibold tabular-nums text-ink", number(value, digits) + (value == null ? "" : unit)),
  );
  return box;
};

const metadata = (label, value) => {
  const row = text("div", "flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-rule py-2 last:border-0", "");
  row.append(text("dt", "text-xs text-muted", label), text("dd", "max-w-full break-all text-xs text-ink", value));
  return row;
};

const freshnessText = observation => {
  if (!observation) return "No approved observation";
  return observation.freshness === "fresh" ? "Fresh" :
    observation.freshness === "stale" ? "Stale" :
    observation.freshness === "offline" ? "Offline" : "Time unknown";
};

const lastUpdate = observation =>
  observation ? dateLabel(observation.sample_at) : "—";

const sourceText = device =>
  device.source_kind === "simulated" ? "Simulated source" :
    device.source_kind === "physical" ? "Physical source" :
      device.source_kind === "vendor" ? "Vendor source, capabilities unverified" : "Source unknown";

const value = (observation, key) => observation?.values?.[key] ?? null;

// --- Shared Mono-Colored SVG Icons (Lucide equivalents) ---
function createIconSvg(paths, className = "size-4 shrink-0") {
  const svg = svgEl("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }, className);
  for (const [tag, attrs] of paths) {
    svg.append(svgEl(tag, attrs));
  }
  return svg;
}

const iconPlay = (cls = "size-3.5 shrink-0") => createIconSvg([["polygon", { points: "6 3 20 12 6 21 6 3" }]], cls);
const iconPause = (cls = "size-3.5 shrink-0") => createIconSvg([["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1" }], ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1" }]], cls);
const iconSquare = (cls = "size-3.5 shrink-0") => createIconSvg([["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }]], cls);
const iconUnlock = (cls = "size-3.5 shrink-0") => createIconSvg([["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }], ["path", { d: "M7 11V7a5 5 0 0 1 9.9-1" }]], cls);
const iconLock = (cls = "size-3.5 shrink-0") => createIconSvg([["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]], cls);
const iconSliders = (cls = "size-3.5 shrink-0 text-muted") => createIconSvg([["line", { x1: "21", x2: "14", y1: "4", y2: "4" }], ["line", { x1: "10", x2: "3", y1: "4", y2: "4" }], ["line", { x1: "21", x2: "12", y1: "12", y2: "12" }], ["line", { x1: "8", x2: "3", y1: "12", y2: "12" }], ["line", { x1: "21", x2: "16", y1: "20", y2: "20" }], ["line", { x1: "12", x2: "3", y1: "20", y2: "20" }], ["line", { x1: "14", x2: "14", y1: "2", y2: "6" }], ["line", { x1: "8", x2: "8", y1: "10", y2: "14" }], ["line", { x1: "16", x2: "16", y1: "18", y2: "22" }]], cls);
const iconClock = (cls = "size-3.5 shrink-0 text-faint") => createIconSvg([["circle", { cx: "12", cy: "12", r: "10" }], ["polyline", { points: "12 6 12 12 16 14" }]], cls);
const iconTag = (cls = "size-3.5 shrink-0 text-faint") => createIconSvg([["path", { d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" }], ["circle", { cx: "7.5", cy: "7.5", r: ".5", fill: "currentColor" }]], cls);
const iconWasher = (cls = "size-4 shrink-0") => createIconSvg([["path", { d: "M3 6h3" }], ["path", { d: "M17 6h.01" }], ["rect", { width: "18", height: "20", x: "3", y: "2", rx: "2" }], ["circle", { cx: "12", cy: "13", r: "5" }], ["path", { d: "M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5" }]], cls);
const iconWind = (cls = "size-4 shrink-0") => createIconSvg([["path", { d: "M12.8 19.6A2 2 0 1 0 14 16H2" }], ["path", { d: "M17.5 8a2.5 2.5 0 1 1 2 4H2" }], ["path", { d: "M9.8 4.4A2 2 0 1 1 11 8H2" }]], cls);
const iconCog = (cls = "size-3.5 shrink-0") => createIconSvg([["path", { d: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" }], ["path", { d: "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" }], ["path", { d: "M12 2v2" }], ["path", { d: "M12 22v-2" }], ["path", { d: "m17 20.66-1-1.73" }], ["path", { d: "M11 10.27 7 3.34" }], ["path", { d: "m20.66 17-1.73-1" }], ["path", { d: "m3.34 7 1.73 1" }], ["path", { d: "M14 12h8" }], ["path", { d: "M2 12h2" }] ], cls);
const iconFilter = (cls = "size-3.5 shrink-0") => createIconSvg([["polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" }]], cls);
const iconLayoutList = (cls = "size-3.5 sm:size-4 shrink-0") => createIconSvg([["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1" }], ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1" }], ["path", { d: "M14 4h7" }], ["path", { d: "M14 9h7" }], ["path", { d: "M14 15h7" }], ["path", { d: "M14 20h7" }]], cls);
const iconLayoutGrid = (cls = "size-3.5 sm:size-4 shrink-0") => createIconSvg([["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1" }], ["rect", { width: "7", height: "7", x: "14", y: "3", rx: "1" }], ["rect", { width: "7", height: "7", x: "14", y: "14", rx: "1" }], ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1" }]], cls);
const iconShieldAlert = (cls = "size-5 shrink-0 text-negative") => createIconSvg([["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }], ["path", { d: "M12 8v4" }], ["path", { d: "M12 16h.01" }]], cls);
const iconShieldCheck = (cls = "size-3.5 shrink-0 text-faint") => createIconSvg([["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }], ["path", { d: "m9 12 2 2 4-4" }]], cls);
const iconAlertTriangle = (cls = "size-5 shrink-0") => createIconSvg([["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }], ["path", { d: "M12 9v4" }], ["path", { d: "M12 17h.01" }]], cls);
const iconSave = (cls = "size-4 shrink-0") => createIconSvg([["path", { d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" }], ["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" }], ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7" }]], cls);
const iconPlus = (cls = "size-4 shrink-0") => createIconSvg([["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]], cls);
const iconX = (cls = "size-5 shrink-0") => createIconSvg([["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]], cls);
const iconFlame = (cls = "size-3.5 shrink-0") => createIconSvg([["path", { d: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" }]], cls);
const iconWrench = (cls = "size-3.5 shrink-0 text-muted") => createIconSvg([["path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" }]], cls);
const iconCheckCircle = (cls = "size-3.5 shrink-0") => createIconSvg([["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "m9 12 2 2 4-4" }]], cls);
const iconRotateCcw = (cls = "size-3 shrink-0") => createIconSvg([["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }], ["path", { d: "M3 3v5h5" }]], cls);
const iconScale = (cls = "size-3.5 shrink-0 text-faint") => createIconSvg([["path", { d: "m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" }], ["path", { d: "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" }], ["path", { d: "M7 21h10" }], ["path", { d: "M12 3v18" }], ["path", { d: "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" }]], cls);
const iconGauge = (cls = "size-3.5 shrink-0 text-faint") => createIconSvg([["path", { d: "m12 14 4-4" }], ["path", { d: "M3.34 19a10 10 0 1 1 17.32 0" }]], cls);
const iconLayers = (cls = "size-3.5 shrink-0 text-faint") => createIconSvg([["path", { d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" }], ["path", { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" }], ["path", { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" }]], cls);
const iconThermometer = (cls = "size-4 shrink-0 text-faint") => createIconSvg([["path", { d: "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" }]], cls);
const iconDroplets = (cls = "size-4 shrink-0 text-faint") => createIconSvg([["path", { d: "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" }], ["path", { d: "M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" }]], cls);

// --- Equipment & Cylinder Vector SVG Illustrations (1:1 Match with Web App) ---
function createWasherSvg(status, sizeClass = "size-28") {
  const svg = svgEl("svg", {
    viewBox: "0 0 100 100",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    role: "img",
    "aria-label": `Commercial Washer illustration (${status})`,
  }, `${sizeClass} text-muted transition-colors group-hover:text-ink select-none`);
  svg.append(
    svgEl("rect", { x: "15", y: "10", width: "70", height: "80", rx: "6" }),
    svgEl("line", { x1: "15", y1: "28", x2: "85", y2: "28", "stroke-width": "2" }),
    svgEl("rect", { x: "23", y: "16", width: "16", height: "7", rx: "1.5", "stroke-width": "1.5" }),
    svgEl("circle", { cx: "73", cy: "19.5", r: "3.5", "stroke-width": "1.5" }),
    svgEl("circle", { cx: "50", cy: "58", r: "23", "stroke-width": "2.5" }),
    svgEl("circle", { cx: "50", cy: "58", r: "16", "stroke-width": "1.5", "stroke-dasharray": "4 3" }),
    svgEl("path", { d: "M 72 55 L 72 61", "stroke-width": "2" }),
  );
  return svg;
}

function createDryerSvg(status, sizeClass = "size-28") {
  const svg = svgEl("svg", {
    viewBox: "0 0 100 100",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    role: "img",
    "aria-label": `Commercial Dryer illustration (${status})`,
  }, `${sizeClass} text-muted transition-colors group-hover:text-ink select-none`);
  svg.append(
    svgEl("rect", { x: "15", y: "10", width: "70", height: "80", rx: "6" }),
    svgEl("line", { x1: "15", y1: "28", x2: "85", y2: "28", "stroke-width": "2" }),
    svgEl("circle", { cx: "27", cy: "19.5", r: "3.5", "stroke-width": "1.5" }),
    svgEl("circle", { cx: "39", cy: "19.5", r: "3.5", "stroke-width": "1.5" }),
    svgEl("rect", { x: "58", y: "16", width: "18", height: "7", rx: "1.5", "stroke-width": "1.5" }),
    svgEl("circle", { cx: "50", cy: "58", r: "23", "stroke-width": "2.5" }),
    svgEl("circle", { cx: "50", cy: "58", r: "16", "stroke-width": "1.5" }),
    svgEl("line", { x1: "42", y1: "54", x2: "58", y2: "54", "stroke-width": "1.5" }),
    svgEl("line", { x1: "40", y1: "58", x2: "60", y2: "58", "stroke-width": "1.5" }),
    svgEl("line", { x1: "42", y1: "62", x2: "58", y2: "62", "stroke-width": "1.5" }),
    svgEl("path", { d: "M 72 55 L 72 61", "stroke-width": "2" }),
  );
  return svg;
}

function createCylinderSvg(fillPercent, status, isMaintenance, sizeClass = "size-14") {
  const validPct = typeof fillPercent === "number" && Number.isFinite(fillPercent);
  const clamped = validPct ? Math.max(0, Math.min(100, fillPercent)) : 0;
  const fillTextColor = validPct ? "fill-ink tabular-nums select-none" : "fill-muted tabular-nums select-none";

  const svg = svgEl("svg", {
    viewBox: "0 0 100 110",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    role: "img",
    "aria-label": validPct ? `LPG Cylinder level: ${clamped.toFixed(1)}%` : "LPG Cylinder level unavailable",
  }, `${sizeClass} text-muted transition-colors group-hover:text-ink select-none`);

  const labelText = svgEl("text", {
    x: "50",
    y: "58",
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-size": "13",
    "font-weight": "600",
    stroke: "none",
  }, fillTextColor);
  labelText.textContent = validPct ? `${clamped.toFixed(1)}%` : "—";

  svg.append(
    svgEl("rect", { x: "44", y: "6", width: "12", height: "6", rx: "1.5", "stroke-width": "2" }),
    svgEl("line", { x1: "50", y1: "12", x2: "50", y2: "18", "stroke-width": "2" }),
    svgEl("path", { d: "M 32 24 L 32 15 C 32 13 36 12 50 12 C 64 12 68 13 68 15 L 68 24", "stroke-width": "2" }),
    svgEl("line", { x1: "38", y1: "18", x2: "62", y2: "18", "stroke-width": "1.5" }),
    svgEl("rect", { x: "20", y: "24", width: "60", height: "68", rx: "8", "stroke-width": "2.5" }),
    labelText,
    svgEl("path", { d: "M 28 92 L 28 99 C 28 101 34 102 50 102 C 66 102 72 101 72 99 L 72 92", "stroke-width": "2" }),
  );
  return svg;
}

function createProgressBarSvg(percent, fillClass = "fill-accent", bgClass = "h-1.5 w-full overflow-hidden rounded-full bg-raised") {
  const clamped = Math.round(Math.max(2, Math.min(100, Number.isFinite(percent) ? percent : 0)));
  const svg = svgEl("svg", {
    viewBox: "0 0 100 4",
    preserveAspectRatio: "none",
    role: "progressbar",
    "aria-valuenow": clamped,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-label": "Progress indicator",
  }, bgClass);
  svg.append(svgEl("rect", { x: "0", y: "0", width: clamped, height: "4" }, fillClass));
  return svg;
}

function getMachineStatusBadge(device) {
  const observation = device.observation;
  const rawState = observation?.state || "UNKNOWN";
  const isFresh = observation?.freshness === "fresh";
  if (!observation) {
    return {
      effectiveStatus: "OFFLINE",
      wrapper: "border-line bg-raised text-muted",
      dot: "bg-muted",
      label: "No approved observation",
    };
  }
  if (!isFresh) {
    return {
      effectiveStatus: "OFFLINE",
      wrapper: "border-line bg-raised text-muted",
      dot: "bg-muted",
      label: `Current state unknown (last reported ${rawState})`,
    };
  }
  switch (rawState) {
    case "RUNNING":
      return {
        effectiveStatus: "RUNNING",
        wrapper: "border-control bg-raised text-ink",
        dot: "bg-muted",
        label: "Running",
      };
    case "IDLE":
      return {
        effectiveStatus: "IDLE",
        wrapper: "border-positive/30 bg-positive/10 text-positive",
        dot: "bg-positive",
        label: "Idle / Available",
      };
    case "PAUSED":
      return {
        effectiveStatus: "PAUSED",
        wrapper: "border-control bg-raised text-ink",
        dot: "bg-muted",
        label: "Paused",
      };
    case "ERROR":
      return {
        effectiveStatus: "ERROR",
        wrapper: "border-negative/40 bg-negative/10 text-negative",
        dot: "bg-negative",
        label: observation.fault_code ? `Fault: ${observation.fault_code}` : "Error",
      };
    default:
      return {
        effectiveStatus: "OFFLINE",
        wrapper: "border-line bg-raised text-muted",
        dot: "bg-muted",
        label: "Offline",
      };
  }
}

function renderGateway(snapshot) {
  const gateway = snapshot.gateway || {};
  byId("gatewayState").textContent =
    gateway.status === "active" ? "Paired locally" : `Gateway ${gateway.status || "unknown"}`;
  byId("branchIdentity").textContent = gateway.branch_id
    ? `Bound branch: ${gateway.branch_id}`
    : "No active branch binding";
  byId("checkedAt").textContent = `Local data checked ${dateLabel(snapshot.checked_at)}`;
}

function renderOverview(snapshot) {
  byId("machineCount").textContent = snapshot.device_counts?.machines ?? "—";
  byId("safetyCount").textContent = snapshot.device_counts?.safety_nodes ?? "—";
  const counts = snapshot.freshness_counts || {};
  byId("deviceFreshness").textContent =
    `${counts.fresh ?? 0} fresh, ${counts.stale ?? 0} stale, ${counts.offline ?? 0} offline, ${snapshot.unknown_devices ?? 0} without readings`;
  for (const [id, key] of [["pendingCount", "pending"], ["syncedCount", "synced"], ["quarantinedCount", "quarantined"]]) {
    byId(id).textContent = snapshot.sync ? String(snapshot.sync[key] ?? 0) : "—";
  }
  const safety = snapshot.safety_nodes || [];
  const safetyCounts = { fresh: 0, stale: 0, offline: 0, unknown: 0 };
  for (const device of safety) safetyCounts[device.observation?.freshness in safetyCounts ? device.observation.freshness : "unknown"]++;
  byId("safetySummary").textContent = safety.length
    ? `${safetyCounts.fresh} fresh, ${safetyCounts.stale} stale, ${safetyCounts.offline} offline, ${safetyCounts.unknown} without readings`
    : "No approved safety node";
  renderDiscoveries(snapshot.discoveries || []);
}

function renderDiscoveries(discoveries) {
  const section = byId("discoveriesSection");
  const list = byId("discoveriesList");
  list.replaceChildren();
  section.classList.toggle("hidden", discoveries.length === 0);
  for (const device of discoveries) {
    const card = text("article", "min-w-0 rounded-md border border-rule bg-raised p-4", "");
    card.append(text("h3", "break-all text-sm font-semibold text-ink", device.source_id));
    const facts = text("dl", "mt-3", "");
    facts.append(
      metadata("Suggested type", device.suggested_type || "Unknown"),
      metadata("Last seen", dateLabel(device.last_seen_at)),
      metadata("Cloud delivery", device.cloud_delivery === "received" ? "Received" : device.cloud_delivery === "rejected" ? "Rejected" : "Pending"),
    );
    card.append(facts);
    list.append(card);
  }
}

let historyRecords = null;
let historyFilter = "all";
let paused = false;
function renderHistory() {
  const rows = byId("historyRows");
  if (!rows) return;
  rows.replaceChildren();
  if (historyRecords === null) {
    const row = document.createElement("tr");
    const cell = text("td", "px-3 py-4 text-muted", "Recent records unavailable");
    cell.colSpan = 4;
    row.append(cell);
    rows.append(row);
    return;
  }
  const shown = historyRecords.filter(record => historyFilter === "all" || record.sync_state === historyFilter);
  if (!shown.length) {
    const row = document.createElement("tr");
    const cell = text("td", "px-3 py-4 text-muted", historyRecords.length ? "No records match this filter" : "No local records for this gateway");
    cell.colSpan = 4;
    row.append(cell);
    rows.append(row);
  }
  for (const record of shown) {
    const row = document.createElement("tr");
    for (const val of [record.source_id || "Unknown source", dateLabel(record.sample_at),
                       record.sync_state || "unknown", record.quarantine_reason || "—"]) {
      row.append(text("td", "max-w-48 break-words px-3 py-3 text-muted", val));
    }
    rows.append(row);
  }
  byId("historyCount").textContent = `${shown.length} of ${historyRecords.length} recent gateway records shown`;
  byId("historyCount").classList.toggle("hidden", historyRecords.length === 0);
}

async function refreshHistory() {
  try {
    const response = await fetch("/api/dashboard/history", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("History unavailable");
    const result = await response.json();
    if (!Array.isArray(result.records)) throw new Error("Malformed history");
    historyRecords = result.records;
    byId("historyNotice").classList.add("hidden");
    renderHistory();
  } catch {
    byId("historyNotice").textContent = "Recent records could not be refreshed; retained rows may be old.";
    byId("historyNotice").classList.remove("hidden");
    renderHistory();
  }
}

// --- Machine Fleet State & Helpers ---
const machineActions = ["start", "pause", "resume", "stop", "clear_fault"];
let vendorCatalog;
let activeMachineDialog = null;
let lastMachinesSnapshot = null;
let machineTypeFilter = "all";
let machineStatusFilter = "all";
let machineViewMode = "grid";

const getVendorCatalog = () => vendorCatalog ||= fetch("/static/vendor-parameters.json").then(response => {
  if (!response.ok) throw new Error("Vendor reference unavailable");
  return response.json();
});

async function submitMachine(source, action, args = {}) {
  const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(source)}/commands`, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Staff-CSRF": document.body.dataset.staffCsrf },
    body: JSON.stringify({ action, arguments: args }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Command request failed");
  return payload;
}

function getMachineComputed(device) {
  const observation = device.observation;
  const isFresh = observation?.freshness === "fresh";
  const badge = getMachineStatusBadge(device);
  const effectiveStatus = badge.effectiveStatus;
  const settings = observation?.settings || {};
  const isWasher = device.type !== "dryer";
  const durationSecs = value(observation, "duration_seconds") ?? (typeof settings.duration_seconds === "number" ? settings.duration_seconds : null);
  const durationMins = durationSecs === null ? null : Math.max(1, Math.round(durationSecs / 60));
  const remainingSecs = isFresh ? value(observation, "remaining_seconds") : null;
  const remainingMins = remainingSecs !== null ? Math.max(0, Math.ceil(remainingSecs / 60)) : 0;
  const rawPrice = value(observation, "price") ?? (settings.price_myr !== undefined ? Number(settings.price_myr) : null);
  const priceVal = rawPrice !== null && Number.isFinite(rawPrice) ? rawPrice : null;
  const programName = !isFresh
    ? "—"
    : settings.program_id === "quick"
      ? (isWasher ? "Quick Wash" : "Quick Dry")
      : settings.program_id === "standard"
        ? (isWasher ? "Standard Wash" : "Standard Dry")
        : typeof settings.program_id === "string" && settings.program_id
          ? settings.program_id.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase())
          : effectiveStatus === "IDLE" ? "Standby" : "Unknown";

  const remainingText = effectiveStatus === "RUNNING"
    ? remainingSecs === null ? "Remaining time unknown" : `${remainingMins} min (${remainingSecs} s) remaining`
    : effectiveStatus === "PAUSED"
      ? remainingSecs === null ? "Remaining time unknown (Paused)" : `${remainingMins} min (${remainingSecs} s) remaining (Paused)`
      : effectiveStatus === "IDLE"
        ? durationSecs === null ? "Ready" : `Ready (${durationMins} min / ${durationSecs} s cycle)`
        : effectiveStatus === "ERROR"
          ? "Cycle interrupted"
          : "Unavailable";

  const progressPct = durationSecs > 0 && remainingSecs !== null
    ? Math.max(0, Math.min(100, ((durationSecs - remainingSecs) / durationSecs) * 100))
    : null;

  return {
    observation,
    isFresh,
    badge,
    effectiveStatus,
    settings,
    isWasher,
    durationSecs,
    durationMins,
    remainingSecs,
    remainingMins,
    priceVal,
    programName,
    remainingText,
    progressPct,
  };
}

// --- Native SVG Charts for Machine Detail Modal (Tab 2: Statistics & Revenue) ---
function createStatisticsChartCard({ title, subtitle, unit, type, labels, datasets, footerNote }) {
  const wrap = text("div", "rounded-md border border-line bg-surface p-4 sm:p-5 space-y-4", "");
  const head = text("div", "flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3", "");
  const titleWrap = text("div", "min-w-0", "");
  titleWrap.append(
    text("h4", "text-xs font-semibold text-ink", title),
    text("p", "mt-0.5 text-xs text-muted", subtitle),
  );
  const legendWrap = text("div", "flex flex-wrap items-center gap-3 text-xs text-muted", "");
  for (const ds of datasets) {
    const item = text("span", "inline-flex items-center gap-1.5", "");
    const dot = text("span", `size-2.5 rounded-full ${ds.dotClass || "bg-positive"}`, "");
    item.append(dot, text("span", "", `${ds.label} (${unit})`));
    legendWrap.append(item);
  }
  head.append(titleWrap, legendWrap);
  wrap.append(head);

  const svg = svgEl("svg", {
    viewBox: "0 0 600 180",
    role: "img",
    "aria-label": `${title} (${unit})`,
  }, "h-44 w-full overflow-visible select-none");

  for (const y of [30, 75, 120, 150]) {
    svg.append(svgEl("line", { x1: "40", y1: y, x2: "580", y2: y, "stroke-width": "1" }, "stroke-rule"));
  }

  const allVals = datasets.flatMap(d => d.data);
  const maxVal = Math.max(10, ...allVals);
  const stepX = labels.length > 1 ? 500 / (labels.length - 1) : 500;

  if (type === "line" && datasets[0]) {
    const pts = datasets[0].data.map((val, idx) => {
      const x = Math.round(55 + idx * stepX);
      const y = Math.round(150 - (val / maxVal) * 110);
      return `${x},${y}`;
    });
    svg.append(svgEl("polyline", {
      fill: "none",
      points: pts.join(" "),
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }, "stroke-positive"));
    datasets[0].data.forEach((val, idx) => {
      const x = Math.round(55 + idx * stepX);
      const y = Math.round(150 - (val / maxVal) * 110);
      svg.append(svgEl("circle", { cx: x, cy: y, r: "4" }, "fill-positive"));
    });
  } else {
    labels.forEach((_, idx) => {
      const baseX = Math.round(50 + idx * (500 / Math.max(1, labels.length)));
      datasets.forEach((ds, dIdx) => {
        const val = ds.data[idx] || 0;
        const barH = Math.max(3, Math.round((val / maxVal) * 110));
        const barY = 150 - barH;
        const barX = baseX + dIdx * 18;
        svg.append(svgEl("rect", {
          x: barX,
          y: barY,
          width: "14",
          height: barH,
          rx: "2",
        }, ds.fillClass || "fill-positive"));
      });
    });
  }

  labels.forEach((lbl, idx) => {
    const x = type === "line"
      ? Math.round(55 + idx * stepX)
      : Math.round(64 + idx * (500 / Math.max(1, labels.length)));
    const t = svgEl("text", {
      x,
      y: "172",
      "text-anchor": "middle",
      "font-size": "10",
    }, "fill-muted tabular-nums");
    t.textContent = lbl.slice(5);
    svg.append(t);
  });

  wrap.append(svg);
  if (footerNote) {
    wrap.append(text("p", "border-t border-rule pt-2.5 text-xs text-faint", footerNote));
  }
  return wrap;
}

// --- Static Vendor Parameter Groups matching MachineDetailModal.tsx ---
const VENDOR_PARAMETER_GROUPS = [
  ["live", "Live Calibration"],
  ["machine", "Machine"],
  ["inverter", "Inverter"],
  ["input", "Input"],
  ["wash", "Wash"],
  ["water_level", "Water Level"],
  ["extract", "Extract"],
  ["temp", "Temperature"],
  ["door", "Door"],
  ["soap", "Soap"],
  ["coin", "Coin"],
  ["others", "Others"],
];

const VENDOR_GROUP_SPECS = {
  machine: {
    title: "Machine Hardware Parameters",
    items: [
      ["Temperature Display", "Celsius"],
      ["Drain Mode", "Idle"],
      ["Display Cycle Pause button", "No"],
      ["Display Cycle Advance Buttons", "Yes"],
      ["Display Cycle Stop Button", "Yes"],
      ["Start Cycle timer based on water temp", "Yes"],
      ["Start Cycle timer based on water level", "Yes"],
      ["End Cycle Signal Duration(S)", "10 s"],
      ["Drain Valve Type", "Normally open"],
      ["Door Pin", "Yes"],
    ],
  },
  inverter: {
    title: "Inverter Controller Parameters",
    items: [
      ["Inverter Type", "TD-EL"],
      ["Control Type", "Terminal"],
      ["Invertor Speed Ratio", "0.16"],
      ["Max Frequency", "160 Hz (Disabled)", true],
      ["Motor rated frequency", "60 Hz (Disabled)", true],
      ["Motor rated voltage", "380 V (Disabled)", true],
      ["V/F Intermediate frequency", "1.5 Hz (Disabled)", true],
      ["V/F Intermediate voltage", "10 V (Disabled)", true],
      ["V/F Minimum output frequency", "1.5 Hz (Disabled)", true],
      ["V/F Minimum output voltage", "10 V (Disabled)", true],
      ["Output frequency upper limit", "120 % (Disabled)", true],
      ["Output frequency lower limit", "6 % (Disabled)", true],
      ["Acceleration time", "20 s (Disabled)", true],
      ["Deceleration time", "30 s (Disabled)", true],
    ],
  },
  input: {
    title: "Discrete Input Switch Parameters",
    items: [
      ["Door Close Switch Type", "N.O"],
      ["Inverter Error Switch Type", "N.O"],
      ["Unbalance Switch Type", "N.O"],
      ["Door Pin Switch Type", "N.O"],
      ["Emergency Switch Type", "N.C"],
    ],
  },
  wash: {
    title: "Drum Wash Timing & Speed Parameters",
    items: [
      ["Forward and reverse protection time", "5 s"],
      ["Standard washing time", "25 s"],
      ["Standard wash stop time", "5 s"],
      ["Light wash time", "5 s"],
      ["Light wash stop time", "15 s"],
      ["Heavy wash time", "60 s"],
      ["Heavy wash stop time", "5 s"],
      ["Standard wash speed", "55 RPM"],
      ["Light wash speed", "50 RPM"],
      ["Heavy wash speed", "60 RPM"],
      ["Max speed", "60 RPM"],
    ],
  },
  water_level: {
    title: "Water Level & Pressure Sensor Settings",
    items: [
      ["Reference level", "0 cm"],
      ["Low water level", "15 cm"],
      ["Mid water level", "20 cm"],
      ["High water level", "25 cm"],
      ["Overflow level", "45 cm"],
      ["Auto water add", "Yes"],
      ["Add Water Differential Level", "4 cm"],
      ["Water protection time", "300 s"],
      ["Heat protection level", "5 cm (Disabled)", true],
      ["Auto heating", "No"],
      ["Stop level difference", "0 cm"],
    ],
  },
  extract: {
    title: "High-Spin Extraction Parameters",
    items: [
      ["Min level for extract", "5"],
      ["Max level in mid extract", "8"],
      ["Balance time with water", "30 s"],
      ["Balance time without water", "30 s"],
      ["Mid extract time", "60 s"],
      ["High extract time 1 / 2 / 3", "20 s / 20 s / 20 s"],
      ["Longest extract time", "600 s"],
      ["Mid / High extract stop time", "15 s / 30 s"],
      ["Times to run rebalance logic before fail", "2"],
      ["Balance speed", "100 RPM"],
      ["Mid extract speed", "300 RPM"],
      ["High extract speed 1 / 2 / 3 / 4", "700 / 800 / 900 / 950 RPM"],
      ["High extract max speed", "1000 RPM"],
    ],
  },
  temp: {
    title: "Thermal Sensor & Heating Limits",
    items: [
      ["Min work temp", "0 °C"],
      ["Max work temp", "70 °C"],
      ["Manual heat temp", "0 °C"],
      ["Heater Element Installed", "Yes"],
      ["Auto heat temp difference", "5 °C"],
      ["Heat protection time", "1200 s"],
      ["Heater min water level", "10 cm"],
      ["Use Heating Element", "Yes"],
    ],
  },
  door: {
    title: "Door Interlock & Safety Thresholds",
    items: [
      ["Door lock safety temp", "45 °C"],
      ["Door lock safety level", "4 CM"],
      ["Pulse Door Lock Time", "1 s"],
      ["Door lock output mode", "Mode 3"],
    ],
  },
  soap: {
    title: "Chemical & Soap Dispenser Timing",
    items: [
      ["Min Water level before Soap Box Start", "5 CM"],
      ["Soap 1 / 2 time", "20 s / 20 s"],
      ["Soap 3 / 4 time", "20 s / 20 s"],
      ["Soap 5 / 6 time", "20 s / 20 s"],
      ["Soap 7 / 8 time", "20 s / 20 s"],
    ],
  },
  coin: {
    title: "Payment & Coin Mechanism Settings",
    items: [
      ["Price Display Type", "Coin value"],
      ["Coin Value", "100"],
      ["Auto Run After Pay", "Yes"],
      ["Enable discount", "No"],
      ["Currency Symbol & Position", "$ (Suffix)"],
      ["Displayed Decimal Places", "0"],
      ["Waiting Time for Automatic Clearance of Remaining Balance", "30 s"],
    ],
  },
  others: {
    title: "Auxiliary Controller Options",
    items: [
      ["Operation mode", "Opl (On-Premises Laundry)"],
      ["Program display qty", "20"],
      ["Display information", "Speed, Water temp, Water, Soap"],
    ],
  },
};

// --- Machine Detail Modal (1:1 Match with MachineDetailModal.tsx) ---
function createMachineDetailModal(device, triggerButtonId) {
  const computed = getMachineComputed(device);
  const { observation, isFresh, badge, effectiveStatus, settings, isWasher, remainingSecs, remainingMins, priceVal, programName, remainingText } = computed;
  const enabled = device.controls_enabled === true && device.source_kind === "simulated";

  const dialog = text(
    "dialog",
    "fixed inset-0 z-50 m-auto hidden h-11/12 w-11/12 max-w-none flex-col overflow-hidden rounded-md border border-control bg-surface p-4 text-ink shadow-2xl backdrop:bg-canvas/80 open:flex sm:p-6",
    "",
  );
  dialog.setAttribute("aria-labelledby", `parameters-title-${device.source_id}`);

  // 1. Modal Header
  const header = text("div", "flex items-start justify-between gap-4 border-b border-rule pb-4", "");
  const headerLeft = text("div", "flex min-w-0 items-center gap-3.5", "");
  const iconBox = text("div", "flex size-11 shrink-0 items-center justify-center rounded-md border border-line bg-raised/60", "");
  iconBox.append(isWasher ? iconWasher("size-6 text-muted") : iconWind("size-6 text-muted"));

  const titleWrap = text("div", "min-w-0", "");
  const titleRow = text("div", "flex flex-wrap items-center gap-2.5", "");
  const dialogTitle = text("h2", "text-xl font-bold tracking-tight text-ink truncate", device.label);
  dialogTitle.id = `parameters-title-${device.source_id}`;
  const capBadge = text("span", "rounded border border-rule bg-raised/40 px-2 py-0.5 text-xs font-semibold text-muted tabular-nums", device.capacity_kg == null ? "Capacity unavailable" : `${number(device.capacity_kg, 1)} kg`);
  const statBadge = text("span", `rounded border px-2.5 py-0.5 text-xs font-semibold ${badge.wrapper}`, badge.label);
  titleRow.append(dialogTitle, capBadge, statBadge);

  const metaRow = text("div", "mt-1 flex flex-wrap items-center gap-3 text-xs text-muted", "");
  metaRow.append(
    text("span", "", device.type.replaceAll("_", " ")),
    text("span", "font-semibold tabular-nums text-ink", `ID: ${device.source_id}`),
  );
  titleWrap.append(titleRow, metaRow);
  headerLeft.append(iconBox, titleWrap);

  const closeBtn = text(
    "button",
    "flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-raised/40 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
    "",
  );
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close modal");
  closeBtn.append(iconX("size-5"), text("span", "sr-only", "Close"));
  closeBtn.addEventListener("click", () => dialog.close());
  header.append(headerLeft, closeBtn);
  dialog.append(header);

  dialog.addEventListener("close", () => {
    activeMachineDialog = null;
    refresh().finally(() => byId(triggerButtonId)?.focus());
  });

  // 2. Modal Tab Selection Bar
  const tabBar = text("div", "mt-4 flex flex-wrap gap-2 border-b border-rule sm:gap-4", "");
  tabBar.setAttribute("role", "tablist");

  const tabPanels = {};
  const tabButtons = {};
  const tabDefs = [
    ["diagnostics", "State & Diagnostics"],
    ["statistics", "Statistics & Revenue"],
    ["programs", "Programs Catalog"],
    ["parameters", "Parameters"],
  ];

  const selectTab = tabKey => {
    for (const [k] of tabDefs) {
      const isSelected = k === tabKey;
      const btn = tabButtons[k];
      const panel = tabPanels[k];
      if (btn) {
        btn.setAttribute("aria-selected", String(isSelected));
        btn.className = isSelected
          ? "min-h-11 border-b-2 border-accent px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
          : "min-h-11 border-b-2 border-transparent px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
      }
      if (panel) panel.classList.toggle("hidden", !isSelected);
    }
  };

  for (const [key, label] of tabDefs) {
    const btn = text(
      "button",
      key === "diagnostics"
        ? "min-h-11 border-b-2 border-accent px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
        : "min-h-11 border-b-2 border-transparent px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
      label,
    );
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(key === "diagnostics"));
    btn.addEventListener("click", () => {
      if (!dialog.open) {
        activeMachineDialog = dialog;
        dialog.showModal();
      }
      selectTab(key);
    });
    tabButtons[key] = btn;
    tabBar.append(btn);
  }
  dialog.append(tabBar);

  const tabBody = text("div", "mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto", "");

  // --- TAB 1: State & Diagnostics ---
  const diagPanel = text("div", "space-y-5", "");
  tabPanels.diagnostics = diagPanel;

  if (effectiveStatus === "ERROR") {
    const faultBanner = text("div", "rounded-md border border-negative/40 bg-negative/10 p-4", "");
    faultBanner.setAttribute("role", "alert");
    const faultInner = text("div", "flex items-start gap-3", "");
    faultInner.append(iconShieldAlert("size-5 shrink-0 text-negative mt-0.5"));
    const faultText = text("div", "space-y-1", "");
    faultText.append(
      text("h3", "text-sm font-semibold text-negative", `Active Fault: ${observation?.fault_code || "SIM_FAULT"}`),
      text("p", "text-xs text-ink", "Remediation protocol: Inspect machine door interlock, water supply pressure, or heating subsystem before clearing fault."),
    );
    faultInner.append(faultText);
    faultBanner.append(faultInner);
    diagPanel.append(faultBanner);
  }

  // Hardware Registration & Provenance Metadata Grid
  const hwGrid = text("div", "grid grid-cols-2 gap-4 rounded-md border border-line bg-raised/30 p-4 sm:grid-cols-4", "");
  const addHwTile = (lbl, val) => {
    const box = text("div", "min-w-0", "");
    box.append(text("span", "text-xs text-muted", lbl), text("p", "mt-1 break-all text-sm font-semibold text-ink", val));
    hwGrid.append(box);
  };
  addHwTile("Hardware Identity", device.source_id);
  addHwTile("Machine type", device.type.replaceAll("_", " "));
  addHwTile("Source Provenance", sourceText(device));
  addHwTile("Freshness & Sample", `${freshnessText(observation)} — ${lastUpdate(observation)}`);
  diagPanel.append(hwGrid);

  const cycleDetails = text("dl", "grid grid-cols-1 gap-3 sm:grid-cols-3", "");
  for (const [label, detail] of [
    ["Cycle program", programName],
    ["Cycle time", remainingText],
    ["Cycle rate", priceVal === null ? "Unavailable" : `RM ${priceVal.toFixed(2)}`],
  ]) {
    const field = text("div", "min-w-0 rounded-md border border-line bg-raised/40 p-3.5", "");
    field.append(text("dt", "text-sm text-muted", label),
      text("dd", "mt-1 break-words text-base font-medium text-ink tabular-nums", detail));
    cycleDetails.append(field);
  }
  diagPanel.append(cycleDetails);

  // Live Telemetry Sensor Grid (6 tiles matching MachineDetailModal.tsx)
  const sensorGrid = text("dl", "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6", "");
  const addSensorTile = (lbl, mainVal, subNote = "") => {
    const tile = text("div", "rounded-md border border-rule bg-raised/30 p-3.5", "");
    tile.append(
      text("dt", "text-xs text-muted", lbl),
      text("dd", "mt-1 text-lg font-bold text-ink tabular-nums", mainVal),
    );
    if (subNote) tile.append(text("p", "mt-0.5 text-xs text-faint", subNote));
    sensorGrid.append(tile);
  };

  const remEstimateDisplay = isFresh && remainingSecs !== null ? `${remainingSecs} s` : "—";
  addSensorTile("Remaining estimate", remEstimateDisplay, isFresh && remainingSecs !== null ? `${remainingMins} min` : "Unavailable");
  addSensorTile("Water Level", isFresh && settings.water_level ? settings.water_level : "Unavailable", "Configured setting");
  const tempVal = isFresh ? (value(observation, "target_temperature_c") ?? settings.target_temperature_c) : null;
  addSensorTile("Target Temp", tempVal === null || tempVal === undefined ? "Unavailable" : `${tempVal} °C`, "Configured target");
  const rpmVal = isFresh ? (value(observation, "spin_rpm") ?? settings.spin_rpm) : null;
  addSensorTile("Target Spin", rpmVal === null || rpmVal === undefined ? "Unavailable" : `${rpmVal} RPM`, "Configured maximum");
  addSensorTile("Power Draw", "Unavailable", "No power sensor");
  addSensorTile("Door Interlock", "Unavailable", "No verified door sensor");
  diagPanel.append(sensorGrid);

  // Operator Command Bar & Fault Injection (Functional Simulator Controls)
  const cmdPanel = text("div", "rounded-md border border-line bg-surface p-4 space-y-4", "");
  cmdPanel.append(text("h3", "text-xs font-semibold text-ink", "Operator Diagnostics & Controls"));
  const cmdStatus = text("p", "text-xs text-muted", enabled ? "Ready to dispatch local machine commands." : "Controls not enabled for this device.");
  cmdStatus.setAttribute("role", "status");

  const programField = text("label", "flex w-full max-w-sm flex-col gap-2 text-sm font-medium text-ink", "Program for START");
  const programSelect = text("select", "min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted", "");
  const availablePrograms = ["quick", "standard"].filter(id =>
    observation?.programs?.[id] && typeof observation.programs[id] === "object",
  );
  const emptyOption = text("option", "", availablePrograms.length ? "Select a program" : "No saved programs");
  emptyOption.value = "";
  programSelect.append(emptyOption);
  for (const id of availablePrograms) {
    const option = text("option", "", id === "quick" ? "Quick" : "Standard");
    option.value = id;
    programSelect.append(option);
  }
  programSelect.value = "";
  programSelect.disabled = !enabled || !isFresh || observation?.state !== "IDLE" || availablePrograms.length === 0;
  programField.append(programSelect);
  cmdPanel.append(programField);

  const actionsRow = text("div", "flex flex-wrap items-center gap-2.5", "");
  let startButton;
  for (const action of machineActions) {
    const labelText = action.replace("_", " ").toUpperCase();
    const state = observation?.state;
    const valid = action === "start" ? state === "IDLE"
      : action === "pause" ? state === "RUNNING"
      : action === "resume" ? state === "PAUSED"
      : action === "stop" ? ["RUNNING", "PAUSED"].includes(state)
      : state === "ERROR";

    const btnStyle = action === "start" || action === "resume"
      ? "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted"
      : action === "stop"
        ? "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-negative bg-negative px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted"
        : "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted";

    const button = text("button", btnStyle, labelText);
    button.type = "button";
    button.disabled = !enabled || !isFresh || !valid || (action === "start" && !programSelect.value);
    if (action === "start") startButton = button;
    button.addEventListener("click", async () => {
      const programId = action === "start" ? programSelect.value : null;
      if (action === "start" && !availablePrograms.includes(programId)) return;
      const confirmation = action === "start"
        ? `Start ${programId === "quick" ? "Quick" : "Standard"} on ${device.label}?`
        : `Request ${action.replace("_", " ")} for ${device.label}?`;
      if (typeof window.confirm === "function" && !window.confirm(confirmation)) return;
      button.disabled = true;
      try {
        const result = await submitMachine(device.source_id, action,
          action === "start" ? { program_id: programId } : {});
        cmdStatus.textContent = `Command ${result.status}. Awaiting result.`;
      } catch (error) {
        cmdStatus.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    actionsRow.append(button);
  }
  programSelect.addEventListener("change", () => {
    if (startButton) startButton.disabled = programSelect.disabled || !availablePrograms.includes(programSelect.value);
  });

  cmdPanel.append(actionsRow);

  // Fault Injection Controls
  if (device.source_kind === "simulated") {
    const faultRow = text("div", "flex flex-wrap items-center gap-2 border-t border-rule pt-3", "");
    faultRow.append(text("span", "text-xs font-medium text-muted mr-1", "Fault Simulation:"));
    const faultDefs = [
      ["SIM_DOOR", "Door fault"],
      ["SIM_HEAT", "Heat fault"],
      ...(device.type === "dryer" ? [] : [["SIM_WATER", "Water fault"]]),
    ];
    for (const [code, label] of faultDefs) {
      const fBtn = text(
        "button",
        "min-h-11 min-w-11 rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-semibold text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted",
        label.toUpperCase(),
      );
      fBtn.type = "button";
      fBtn.disabled = !enabled || !isFresh || !["IDLE", "RUNNING", "PAUSED"].includes(observation?.state);
      fBtn.addEventListener("click", async () => {
        if (typeof window.confirm === "function" && !window.confirm(`Inject ${label} on ${device.label}?`)) return;
        try {
          await submitMachine(device.source_id, "inject_fault", { fault_code: code });
          cmdStatus.textContent = "Fault request queued. Awaiting result.";
        } catch (error) {
          cmdStatus.textContent = error.message;
        }
      });
      faultRow.append(fBtn);
    }
    cmdPanel.append(faultRow);
  }

  cmdPanel.append(cmdStatus);

  // Recent Command Audit History
  const historyWrap = text("div", "border-t border-rule pt-3 space-y-2", "");
  historyWrap.append(text("h4", "text-xs font-semibold text-ink", "Recent commands"));
  const historyList = text("ul", "space-y-2 text-xs text-muted", "");
  historyWrap.append(historyList);
  if (enabled) {
    fetch(`/api/dashboard/machines/${encodeURIComponent(device.source_id)}/commands`, { credentials: "same-origin" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Command history unavailable")))
      .then(payload => {
        historyList.replaceChildren();
        for (const item of payload.commands || []) {
          historyList.append(text("li", "border-b border-rule py-2 last:border-0", `${item.action.replace("_", " ")}: ${item.status}${item.reason ? ` (${item.reason})` : ""} — ${dateLabel(item.issued_at)}`));
        }
        if (!payload.commands?.length) historyList.append(text("li", "text-xs text-muted", "No local commands recorded"));
      })
      .catch(() => {
        historyList.replaceChildren(text("li", "text-xs text-warning", "Command history unavailable"));
      });
  } else {
    historyList.append(text("li", "text-xs text-muted", "Local command audit log inactive when controls are disabled."));
  }
  cmdPanel.append(historyWrap);
  diagPanel.append(cmdPanel);

  const statsPanel = text("div", "hidden space-y-4", "");
  tabPanels.statistics = statsPanel;
  let activeStatisticsChart = null;
  const statsControls = text("div", "flex flex-col gap-3 sm:flex-row", "");
  const metricSelect = text("select", "min-h-11 w-full rounded-md border border-control bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent sm:w-auto", "");
  metricSelect.setAttribute("aria-label", "Chart metric");
  for (const [value, label] of [["cycles", "Completed cycles"], ["running", "Running minutes"], ["revenue", "Estimated revenue"]]) {
    const option = text("option", "", label); option.value = value; metricSelect.append(option);
  }
  metricSelect.value = "cycles";
  const periodSelect = text("select", "min-h-11 w-full rounded-md border border-control bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent sm:w-auto", "");
  periodSelect.setAttribute("aria-label", "Chart period");
  for (const [value, label] of [["day", "Today"], ["week", "Past 7 days"], ["month", "Past 30 days"]]) {
    const option = text("option", "", label); option.value = value; periodSelect.append(option);
  }
  periodSelect.value = "day";
  statsControls.append(metricSelect, periodSelect);
  const statsContent = text("div", "space-y-4", "");
  statsContent.setAttribute("aria-live", "polite");
  statsPanel.append(statsControls, statsContent);
  let statsData = null;
  function renderStatistics() {
    if (activeStatisticsChart) { activeStatisticsChart.destroy(); activeStatisticsChart = null; }
    statsContent.replaceChildren();
    if (!statsData) { statsContent.append(text("p", "text-sm text-muted", "Loading recorded cycles")); return; }
    const summary = statsData.summary;
    const figures = text("dl", "grid grid-cols-1 gap-4 sm:grid-cols-3", "");
    for (const [label, value] of [
      ["Completed cycles", String(summary.completed_cycles)],
      ["Actual running minutes", (summary.running_seconds / 60).toFixed(1)],
      ["Estimated revenue", `RM ${Number(summary.estimated_revenue_myr).toFixed(2)}`],
    ]) {
      const item = text("div", "rounded-md border border-rule bg-raised p-4", "");
      item.append(text("dt", "text-xs text-muted", label), text("dd", "mt-2 text-2xl font-semibold tabular-nums text-ink", value));
      figures.append(item);
    }
    statsContent.append(figures);
    const events = Array.isArray(statsData.events) ? statsData.events : [];
    if (!events.length) {
      statsContent.append(text("p", "rounded-md border border-rule bg-raised p-4 text-sm text-muted", "No recorded cycles in this period"));
    } else {
      const metric = metricSelect.value;
      const chart = text("figure", "space-y-4 rounded-md border border-rule bg-raised p-4", "");
      chart.dataset.chartKind = `chartjs-${metric}`;
      const title = metric === "cycles" ? "Completed cycles by period" : metric === "running" ? "Actual running minutes by period" : "Estimated revenue by period";
      chart.append(text("h3", "text-base font-semibold text-ink", title));
      const canvasWrap = text("div", "relative h-56 w-full sm:h-64", "");
      const canvas = text("canvas", "h-full w-full", "");
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", title);
      canvasWrap.append(canvas);
      chart.append(canvasWrap);
      chart.append(text("figcaption", "text-xs text-muted", "Exact values are available in the table below."));
      statsContent.append(chart);
      if (typeof Chart === "function") {
        const css = getComputedStyle(document.documentElement);
        const color = token => css.getPropertyValue(`--color-${token}`).trim();
        const labels = statsData.series.map(row => row.timestamp);
        const quick = statsData.series.map(row => events.filter(event => event.outcome === "completed" && event.program_id === "quick" && event.local_date === row.timestamp).length);
        const standard = statsData.series.map((row, index) => Number(row.cycles) - quick[index]);
        const datasets = metric === "cycles" ? [
          { label: "Quick", data: quick, backgroundColor: color("accent"), borderRadius: 3 },
          { label: "Standard", data: standard, backgroundColor: color("positive"), borderRadius: 3 },
        ] : [{ label: metric === "running" ? "Running minutes" : "Estimated revenue (RM)",
          data: statsData.series.map(row => metric === "running" ? Number(row.running_seconds) / 60 : Number(row.revenue_myr)),
          borderColor: color(metric === "running" ? "positive" : "accent"),
          backgroundColor: color(metric === "running" ? "positive" : "accent"),
          pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, tension: 0.2, fill: false }];
        activeStatisticsChart = new Chart(canvas, { type: metric === "cycles" ? "bar" : "line",
          data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false,
            animation: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? false : { duration: 250 },
            scales: { x: { stacked: metric === "cycles", ticks: { color: color("muted"), maxRotation: 0 }, grid: { display: false } },
              y: { stacked: metric === "cycles", beginAtZero: true, ticks: { color: color("muted"), precision: metric === "cycles" ? 0 : 1 }, grid: { color: color("line") } } },
            plugins: { legend: { display: metric === "cycles", labels: { color: color("ink") } },
              tooltip: { callbacks: { label: context => `${context.dataset.label}: ${metric === "revenue" ? "RM " : ""}${context.parsed.y}${metric === "running" ? " min" : ""}` } } } } });
      } else chart.append(text("p", "text-sm text-warning", "Chart unavailable; use the data table below."));
      const tableWrap = text("div", "overflow-x-auto rounded-md border border-rule", "");
      const table = text("table", "w-full min-w-96 text-sm", "");
      const head = text("thead", "bg-navy text-muted", "");
      const headingRow = text("tr", "", "");
      for (const label of ["Date (Malaysia)", "Completed cycles", "Stopped cycles", "Running minutes", "Estimated revenue"]) headingRow.append(text("th", "px-4 py-3 text-left font-semibold", label));
      head.append(headingRow); table.append(head);
      const body = text("tbody", "divide-y divide-rule", "");
      for (const row of statsData.series) {
        const tr = text("tr", "bg-surface", "");
        for (const value of [row.timestamp, String(row.cycles), String(row.stopped), (row.running_seconds / 60).toFixed(1), `RM ${Number(row.revenue_myr).toFixed(2)}`]) {
          tr.append(text("td", "px-4 py-3 tabular-nums text-ink", value));
        }
        body.append(tr);
      }
      table.append(body); tableWrap.append(table); statsContent.append(tableWrap);
    }
    const attempts = summary.stopped + summary.faulted + summary.interrupted;
    if (attempts) statsContent.append(text("p", "text-xs text-muted", `${attempts} other recorded attempts are excluded from completed cycles and estimated revenue.`));
    statsContent.append(text("p", "text-xs text-muted", "Recorded simulator cycles only. Revenue is an estimate, not a payment record."));
  }
  async function loadStatistics() {
    statsData = null; renderStatistics();
    try {
      const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(device.source_id)}/statistics?period=${periodSelect.value}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("Recorded statistics unavailable");
      statsData = await response.json(); renderStatistics();
    } catch {
      statsContent.replaceChildren(text("p", "rounded-md border border-warning bg-raised p-4 text-sm text-warning", "Recorded statistics unavailable"));
    }
  }
  metricSelect.addEventListener("change", renderStatistics);
  periodSelect.addEventListener("change", loadStatistics);
  tabButtons.statistics.addEventListener("click", loadStatistics);

  // Saved simulator programs are displayed separately from vendor reference settings.
  const progsPanel = text("div", "hidden space-y-3", "");
  tabPanels.programs = progsPanel;
  progsPanel.append(text("h3", "text-base font-semibold text-ink", "Supported programs"));
  const programList = text("ul", "space-y-2", "");
  for (const [id, name] of [["standard", isWasher ? "Standard Wash" : "Standard Dry"], ["quick", isWasher ? "Quick Wash" : "Quick Dry"]]) {
    const item = text("li", "rounded-md border border-rule bg-raised p-4 text-sm text-ink", name);
    if (settings.program_id === id) item.append(text("span", "ml-2 text-xs text-ink", "Selected"));
    const saved = observation?.programs?.[id] || (observation?.settings?.program_id === id ? observation.settings : null);
    if (saved) {
      const details = text("dl", "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2", "");
      for (const [label, value] of [["Cycle rate", `RM ${saved.price_myr}`], ["Target duration", `${saved.duration_seconds} seconds`]]) {
        const field = text("div", "", "");
        field.append(text("dt", "text-xs text-muted", label), text("dd", "text-sm tabular-nums text-ink", value));
        details.append(field);
      }
      item.append(details);
    }
    programList.append(item);
  }
  progsPanel.append(programList);
  // --- TAB 4: Parameters & Pricing (Live Calibration + 11 Vendor Categories) ---
  const paramsPanel = text("div", "hidden space-y-5", "");
  tabPanels.parameters = paramsPanel;

  const paramSubBar = text("div", "flex flex-wrap gap-2 border-b border-rule pb-3", "");
  const paramSubPanes = {};
  const paramSubButtons = {};

  // Sub-tab 1: Live Calibration Form (Real Functional Simulator Settings!)
  const livePane = text("div", "rounded-md border border-line bg-surface p-5 space-y-4", "");
  const liveHead = text("div", "border-b border-rule pb-3", "");
  liveHead.append(text("h3", "text-xs font-semibold text-ink", "Active Machine Calibration"));
  livePane.append(liveHead);

  const requiredSettings = device.type === "dryer"
    ? ["program_id", "price_myr", "duration_seconds", "target_temperature_c"]
    : ["program_id", "price_myr", "duration_seconds", "target_temperature_c", "water_level", "spin_rpm"];
  const canEditSettings = enabled && isFresh && effectiveStatus === "IDLE" && requiredSettings.every(key => settings[key] != null);
  if (!canEditSettings) {
    const restrictNote = text("div", "rounded border border-warning/30 bg-warning/10 p-3 text-xs text-ink", "");
    restrictNote.append(
      text("p", "font-semibold text-warning", "Modifications Restricted"),
      text("p", "mt-0.5 text-muted", "Parameters and cycle rates can only be calibrated when local controls are enabled and the machine is fresh in IDLE status."),
    );
    livePane.append(restrictNote);
  }

  const formStatus = text("p", "text-xs text-muted", "");
  formStatus.setAttribute("role", "status");

  const form = text("form", "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", "");
  const fields = [
    ["program_id", "Program", "select", [["quick", "Quick"], ["standard", "Standard"]]],
    ["price_myr", "Cycle Rate (MYR)", "number"],
    ["duration_seconds", "Default Duration (Seconds)", "number"],
    ["target_temperature_c", "Operating Temperature (°C)", "number"],
    ...(device.type === "dryer" ? [] : [
      ["water_level", "Water Level Setting", "select", [["low", "Low (Economic load)"], ["medium", "Medium (Standard load)"], ["high", "High (Full drum)"]]],
      ["spin_rpm", "Maximum Spin Speed (RPM)", "number"],
    ]),
  ];

  for (const [key, label, kind, options] of fields) {
    const box = text("label", "flex flex-col gap-1.5 text-xs font-medium text-ink", label);
    const input = document.createElement(kind === "select" ? "select" : "input");
    input.name = key;
    input.disabled = !canEditSettings;
    input.className = "min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted";
    if (kind === "select") {
      const missing = text("option", "", "Unavailable");
      missing.value = "";
      input.append(missing);
      for (const [val, name] of options) {
        const option = text("option", "", name);
        option.value = val;
        input.append(option);
      }
    } else {
      input.type = "number";
      input.required = true;
      input.step = key === "price_myr" ? "0.01" : "1";
    }
    input.value = settings[key] ?? "";
    box.append(input);
    form.append(box);
  }

  const saveRow = text("div", "flex justify-end border-t border-rule pt-4 sm:col-span-2 lg:col-span-3", "");
  const saveBtn = text(
    "button",
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-5 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted",
    "Save Parameters",
  );
  saveBtn.type = "submit";
  saveBtn.disabled = !canEditSettings;
  saveRow.append(saveBtn);
  form.append(saveRow);

  form.elements?.program_id?.addEventListener("change", () => {
    const selected = observation?.programs?.[form.elements.program_id.value];
    if (!selected) return;
    for (const key of requiredSettings) {
      if (key !== "program_id" && form.elements[key]) form.elements[key].value = selected[key] ?? "";
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (typeof window.confirm === "function" && !window.confirm(`Save parameters for ${device.label}?`)) return;
    const data = new FormData(form);
    const args = {
      program_id: data.get("program_id"),
      price_myr: data.get("price_myr"),
      duration_seconds: Number(data.get("duration_seconds")),
      target_temperature_c: Number(data.get("target_temperature_c")),
      water_level: device.type === "dryer" ? null : data.get("water_level"),
      spin_rpm: device.type === "dryer" ? null : Number(data.get("spin_rpm")),
    };
    try {
      await submitMachine(device.source_id, "set_settings", args);
      formStatus.textContent = "Settings request queued. Awaiting result.";
    } catch (error) {
      formStatus.textContent = error.message;
    }
  });

  livePane.append(form, formStatus);
  paramSubPanes.live = livePane;

  // Sub-tabs 2-12: Vendor Parameter Categories (Dummy Reference matching MachineDetailModal.tsx)
  for (const [groupKey, spec] of Object.entries(VENDOR_GROUP_SPECS)) {
    const pane = text("div", "hidden rounded-md border border-line bg-surface p-5 space-y-4", "");
    const pHead = text("div", "border-b border-rule pb-3", "");
    pHead.append(text("h3", "text-xs font-semibold text-ink", spec.title));
    pane.append(pHead);
    const dl = text("dl", "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", "");
    for (const [dtLabel, ddVal, isDisabled] of spec.items) {
      const itemBox = text("div", "rounded border border-rule bg-raised/30 p-3", "");
      itemBox.append(
        text("dt", "text-xs text-muted", dtLabel),
        text("dd", isDisabled ? "mt-1 text-sm font-semibold text-faint line-through" : "mt-1 text-sm font-semibold text-ink", ddVal),
      );
      dl.append(itemBox);
    }
    pane.append(dl);
    paramSubPanes[groupKey] = pane;
  }

  for (const [gKey, gLabel] of VENDOR_PARAMETER_GROUPS) {
    const pBtn = text(
      "button",
      gKey === "live"
        ? "min-h-11 rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
        : "min-h-11 rounded-md bg-raised/40 px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
      gLabel,
    );
    pBtn.type = "button";
    pBtn.addEventListener("click", () => {
      for (const [k] of VENDOR_PARAMETER_GROUPS) {
        const active = k === gKey;
        paramSubButtons[k].className = active
          ? "min-h-11 rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
          : "min-h-11 rounded-md bg-raised/40 px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
        paramSubPanes[k]?.classList.toggle("hidden", !active);
      }
    });
    paramSubButtons[gKey] = pBtn;
    paramSubBar.append(pBtn);
  }

  paramsPanel.append(paramSubBar, livePane);
  for (const [groupKey] of Object.entries(VENDOR_GROUP_SPECS)) {
    paramsPanel.append(paramSubPanes[groupKey]);
  }

  // Vendor Parameter Reference Catalog (from /static/vendor-parameters.json)
  const reference = text("details", "mt-4 border-t border-rule pt-4", "");
  reference.append(text("summary", "min-h-11 cursor-pointer text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent", "Vendor parameter reference"));
  reference.append(text("p", "mt-2 text-xs text-muted", "Unverified vendor fields are unavailable."));
  const groups = text("div", "mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2", "");
  getVendorCatalog().then(catalog => {
    for (const [group, fieldsList] of Object.entries(catalog)) {
      const item = text("section", "min-w-0 rounded-md border border-rule bg-raised p-3", "");
      item.append(text("h6", "text-xs font-semibold text-ink", group));
      const list = text("ul", "mt-2 space-y-1", "");
      for (const field of fieldsList) list.append(text("li", "break-words text-xs text-muted", `${field}: unavailable`));
      item.append(list);
      groups.append(item);
    }
  }).catch(() => {
    groups.append(text("p", "text-xs text-warning", "Vendor reference unavailable"));
  });
  reference.append(groups);
  paramsPanel.append(reference);

  tabBody.append(diagPanel, statsPanel, progsPanel, paramsPanel);
  dialog.append(tabBody);

  return { dialog, selectTab };
}

// --- Full-Width Machine Row & Stacked Card (1:1 Match with MachineRowCard.tsx) ---
function machineRowCard(device) {
  const computed = getMachineComputed(device);
  const { observation, isFresh, badge, effectiveStatus, isWasher, remainingSecs, remainingMins } = computed;
  const enabled = device.controls_enabled === true && device.source_kind === "simulated";
  const triggerId = `parameters-open-${device.source_id}`;
  const { dialog, selectTab } = createMachineDetailModal(device, triggerId);

  const openModal = (initialTab = "diagnostics") => {
    activeMachineDialog = dialog;
    selectTab(initialTab);
    dialog.showModal();
  };

  const card = text(
    "article",
    "flex min-w-0 w-full flex-col gap-4 rounded-md border border-line bg-surface p-4 sm:p-5 md:p-6",
    "",
  );
  card.setAttribute("aria-label", `${device.label} (${badge.label})`);

  // Machine identity, followed by separate compact facts and freshness panels.
  const tier1 = text("div", "flex min-w-0 items-center gap-3.5", "");
  const iconWrap = text("div", "flex size-12 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/30 p-1.5", "");
  iconWrap.append(isWasher ? createWasherSvg(effectiveStatus, "size-9 shrink-0") : createDryerSvg(effectiveStatus, "size-9 shrink-0"));
  tier1.append(iconWrap, text("h3", "min-w-0 break-words text-base font-semibold leading-normal text-ink", device.label));
  card.append(tier1);

  const panelClass = "w-full min-w-0 rounded-md border border-line bg-raised/40 p-3.5 md:p-4";
  const specsPanel = text("dl", `${panelClass} grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`, "");
  for (const [label, detail] of [
    ["Capacity", device.capacity_kg == null ? "Unavailable" : `${number(device.capacity_kg, 1)} kg`],
    ["Source", sourceText(device)],
    ["Device ID", device.source_id],
  ]) {
    const field = text("div", "min-w-0", "");
    field.append(text("dt", "text-sm leading-normal text-muted", label),
      text("dd", "mt-1 break-words text-base font-medium leading-normal text-ink", detail));
    specsPanel.append(field);
  }
  const statusField = text("div", "min-w-0", "");
  statusField.append(text("dt", "text-sm leading-normal text-muted", "Status"));
  const statusValue = text("dd", "mt-1", "");
  const statusPill = text("span", `inline-flex min-w-0 max-w-full items-center gap-2 rounded border px-2.5 py-1 text-sm font-medium ${badge.wrapper}`, "");
  statusPill.append(text("span", `size-2 rounded-full ${badge.dot}`, ""), text("span", "", badge.label));
  statusValue.append(statusPill);
  statusField.append(statusValue);
  specsPanel.append(statusField);

  const freshnessPanel = text("dl", `${panelClass} grid grid-cols-1 gap-3 sm:grid-cols-2`, "");
  for (const [label, detail] of [["Freshness", freshnessText(observation)], ["Last update", lastUpdate(observation)]]) {
    const field = text("div", "min-w-0", "");
    field.append(text("dt", "text-sm leading-normal text-muted", label),
      text("dd", "mt-1 break-words text-base font-medium leading-normal text-ink", detail));
    freshnessPanel.append(field);
  }
  // The card keeps only the remaining estimate; program, duration and rate are in the modal.
  const remainingPanel = text("dl", "w-full min-w-0 rounded-md border border-line bg-raised/40 p-3.5 md:p-4", "");
  const remainingField = text("div", "min-w-0", "");
  const remEstimateVal = isFresh && remainingSecs !== null ? `${remainingSecs} s (${remainingMins} min)` : "—";
  remainingField.append(
    text("dt", "text-sm leading-normal text-muted", "Remaining estimate"),
    text("dd", "mt-1 text-base font-semibold leading-normal text-ink tabular-nums", remEstimateVal),
  );
  remainingPanel.append(remainingField);

  // Tier 3: Machine Action Row
  const tier3 = text("div", "flex flex-col gap-3 border-t border-rule pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between", "");
  const canStart = enabled && isFresh && (effectiveStatus === "IDLE" || effectiveStatus === "PAUSED");
  const canPause = enabled && isFresh && effectiveStatus === "RUNNING";
  const canStop = enabled && isFresh && (effectiveStatus === "RUNNING" || effectiveStatus === "PAUSED");

  const actionError = text("p", "hidden rounded-md border-l-2 border-negative bg-raised px-4 py-3 text-sm text-ink", "");
  actionError.setAttribute("role", "alert");

  const controlsGroup = text("div", "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center", "");
  controlsGroup.setAttribute("role", "group");
  controlsGroup.setAttribute("aria-label", "Cycle controls");

  const makeRowActionBtn = (label, iconNode, cmdAction, isEnabled, styleClass) => {
    const btn = text("button", styleClass, "");
    btn.type = "button";
    btn.disabled = !isEnabled;
    btn.append(iconNode, text("span", "", label));
    btn.addEventListener("click", async () => {
      if (cmdAction === "start") {
        openModal("diagnostics");
        return;
      }
      actionError.classList.add("hidden");
      btn.disabled = true;
      try {
        await submitMachine(device.source_id, cmdAction);
      } catch (err) {
        actionError.textContent = err.message || `Failed to execute ${cmdAction}`;
        actionError.classList.remove("hidden");
      } finally {
        btn.disabled = !isEnabled;
      }
    });
    return btn;
  };

  controlsGroup.append(
    makeRowActionBtn(
      effectiveStatus === "PAUSED" ? "Resume" : "Start",
      iconPlay("size-3.5 shrink-0"),
      effectiveStatus === "PAUSED" ? "resume" : "start",
      canStart,
      "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted",
    ),
    makeRowActionBtn(
      "Pause",
      iconPause("size-3.5 shrink-0"),
      "pause",
      canPause,
      "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted",
    ),
    makeRowActionBtn(
      "Stop",
      iconSquare("size-3.5 shrink-0"),
      "stop",
      canStop,
      "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-negative bg-negative px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted",
    ),
  );

  if (effectiveStatus === "IDLE" || effectiveStatus === "ERROR") {
    const unlockBtn = text(
      "button",
      "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
      "",
    );
    unlockBtn.type = "button";
    unlockBtn.append(iconUnlock("size-3.5 shrink-0"), text("span", "", "Unlock door"));
    unlockBtn.addEventListener("click", () => openModal("diagnostics"));
    controlsGroup.append(unlockBtn);
  }

  const detailsBtn = text(
    "button",
    "inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
    "",
  );
  detailsBtn.type = "button";
  detailsBtn.id = triggerId;
  detailsBtn.append(iconSliders("size-4 shrink-0 text-muted"), text("span", "", "Details & parameters"));
  detailsBtn.addEventListener("click", () => openModal("diagnostics"));

  tier3.append(detailsBtn);
  if (enabled && device.source_id === "washer-sim-01") {
    const checkoutLink = text(
      "a",
      "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-navy px-4 text-sm font-medium text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
      "Create demo QR",
    );
    checkoutLink.href = "/demo/new?source_id=washer-sim-01";
    tier3.append(checkoutLink);
  }
  card.append(controlsGroup, specsPanel, freshnessPanel, remainingPanel, tier3, actionError, dialog);
  return card;
}

// --- Machine Fleet View (Full-Width Stacked Row Layout) ---
function renderMachines(snapshot) {
  lastMachinesSnapshot = snapshot;
  if (activeMachineDialog?.open) return;
  const root = byId("machinesContent");
  root.replaceChildren();
  const allDevices = (snapshot.devices || []).map(device => ({
    ...device,
    controls_enabled: snapshot.local_controls_enabled,
  }));
  if (!allDevices.length) {
    root.append(empty("No approved machines on this gateway."));
    return;
  }

  const totalCount = allDevices.length;
  const washerCount = allDevices.filter(d => d.type === "washer" || d.type === "washer_dryer").length;
  const dryerCount = allDevices.filter(d => d.type === "dryer").length;

  const statusOf = d => getMachineStatusBadge(d).effectiveStatus;
  const runningCount = allDevices.filter(d => statusOf(d) === "RUNNING").length;
  const idleCount = allDevices.filter(d => statusOf(d) === "IDLE").length;
  const errorCount = allDevices.filter(d => statusOf(d) === "ERROR").length;
  const offlineCount = allDevices.filter(d => statusOf(d) === "OFFLINE").length;

  const filtered = allDevices.filter(d => {
    if (machineTypeFilter === "washer" && d.type !== "washer" && d.type !== "washer_dryer") return false;
    if (machineTypeFilter === "dryer" && d.type !== "dryer") return false;
    if (machineStatusFilter !== "all" && statusOf(d) !== machineStatusFilter) return false;
    return true;
  });

  // Outer fleet container (root.children[0])
  const fleetSection = text("section", "space-y-6", "");

  // Child 0: Overview & Quick Filters Bar
  const filterHeaderWrap = text("div", "space-y-4", "");
  const filterPanel = text("div", "rounded-md border border-line bg-surface p-3.5 sm:p-4 md:p-5 space-y-4", "");

  const typeGroup = text("div", "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center", "");
  typeGroup.setAttribute("role", "group");
  typeGroup.setAttribute("aria-label", "Filter by equipment category");

  const typeLabel = text("span", "inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted mr-0.5 sm:mr-1", "");
  typeLabel.append(iconCog("size-3.5 shrink-0"), text("span", "", "Type:"));
  typeGroup.append(typeLabel);

  const makeTypeBtn = (filterKey, label, count, iconNode, extraClass = "") => {
    const active = machineTypeFilter === filterKey;
    const btn = text(
      "button",
      `${extraClass} inline-flex min-h-11 items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-md px-3 py-2 sm:px-3.5 text-xs sm:text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active
          ? "border border-ink bg-ink font-semibold text-surface"
          : "border border-line bg-raised/40 text-muted hover:border-control hover:bg-raised hover:text-ink"
      }`.trim(),
      "",
    );
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(active));
    if (iconNode) btn.append(iconNode);
    btn.append(text("span", "", `${label} (${count})`));
    btn.addEventListener("click", () => {
      machineTypeFilter = filterKey;
      renderMachines(lastMachinesSnapshot);
    });
    return btn;
  };

  typeGroup.append(
    makeTypeBtn("all", "All Equipment", totalCount, null, "col-span-2 sm:col-auto"),
    makeTypeBtn("washer", "Washers", washerCount, iconWasher("size-3.5 sm:size-4 shrink-0")),
    makeTypeBtn("dryer", "Dryers", dryerCount, iconWind("size-3.5 sm:size-4 shrink-0")),
  );
  filterPanel.append(typeGroup);

  // Status Sub-Filters Row
  const statusRowWrap = text("div", "border-t border-rule pt-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", "");
  const statusGroup = text("div", "flex flex-wrap items-center gap-1.5 sm:gap-2", "");
  statusGroup.setAttribute("role", "group");
  statusGroup.setAttribute("aria-label", "Filter by operational status");

  const statusLabel = text("span", "inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted mr-0.5 sm:mr-1", "");
  statusLabel.append(iconFilter("size-3.5 shrink-0"), text("span", "", "Status:"));
  statusGroup.append(statusLabel);

  const makeStatusBtn = (sKey, sLabel, count, activeClasses) => {
    const active = machineStatusFilter === sKey;
    const btn = text(
      "button",
      `inline-flex min-h-11 items-center justify-center rounded-md px-2.5 sm:px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active ? activeClasses : "border border-line bg-raised/40 font-medium text-muted hover:border-control hover:bg-raised hover:text-ink"
      }`,
      `${sLabel} (${count})`,
    );
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(active));
    btn.addEventListener("click", () => {
      machineStatusFilter = sKey;
      renderMachines(lastMachinesSnapshot);
    });
    return btn;
  };

  statusGroup.append(
    makeStatusBtn("all", "All", totalCount, "border border-control bg-navy-selected font-semibold text-ink"),
    makeStatusBtn("RUNNING", "Running", runningCount, "border border-control bg-navy-selected font-semibold text-ink"),
    makeStatusBtn("IDLE", "Idle", idleCount, "border border-control bg-navy-selected font-semibold text-ink"),
    makeStatusBtn("ERROR", "Error", errorCount, "border border-control bg-navy-selected font-semibold text-ink"),
    makeStatusBtn("OFFLINE", "Offline", offlineCount, "border border-control bg-navy-selected font-semibold text-ink"),
  );

  statusRowWrap.append(statusGroup);
  filterPanel.append(statusRowWrap);
  filterHeaderWrap.append(filterPanel);
  fleetSection.append(filterHeaderWrap);

  // Child 1: Full-Width Stacked Row Cards Container (where children[0] is <article> card)
  if (filtered.length > 0) {
    const cardsContainer = text("div", "space-y-4", "");
    cardsContainer.setAttribute("role", "feed");
    cardsContainer.setAttribute("aria-label", "Machine equipment list");
    for (const device of filtered) {
      cardsContainer.append(machineRowCard(device));
    }
    fleetSection.append(cardsContainer);
  } else {
    const emptyFilter = text("div", "flex flex-col items-center justify-center rounded-md border border-line bg-surface p-12 text-center", "");
    emptyFilter.append(
      iconWasher("size-10 text-faint"),
      text("h3", "mt-3 text-sm font-semibold text-ink", "No Machines Match Filter"),
      text("p", "mt-1 max-w-sm text-xs text-muted", "No equipment on this gateway satisfies the selected category or status criteria."),
    );
    const resetBtn = text(
      "button",
      "mt-4 inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent",
      "Reset Filters",
    );
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () => {
      machineTypeFilter = "all";
      machineStatusFilter = "all";
      renderMachines(lastMachinesSnapshot);
    });
    emptyFilter.append(resetBtn);
    fleetSection.append(emptyFilter);
  }

  root.append(fleetSection);
}

// --- Full-Width LPG & Safety Row & Stacked Card (Modeled on MachineRowCard.tsx) ---
function safetyCard(device) {
  const observation = device.observation;
  const fresh = observation?.freshness === "fresh";
  const reading = key => fresh ? value(observation, key) : null;
  const percent = reading("lpg_percent");
  const validPercent = typeof percent === "number" && Number.isFinite(percent);

  const freshnessBadgeClass = fresh
    ? "border-positive/30 bg-positive/10 text-positive"
    : observation?.freshness === "stale"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-line bg-raised text-muted";
  const freshnessDotClass = fresh
    ? "bg-positive"
    : observation?.freshness === "stale"
      ? "bg-warning"
      : "bg-muted";

  const card = text(
    "article",
    "flex min-w-0 w-full flex-col gap-4 rounded-md border border-line bg-surface p-4 sm:p-5 md:p-6",
    "",
  );
  card.setAttribute("aria-label", `${device.label} (${freshnessText(observation)})`);

  // Tier 1: Node Identity & Freshness Status Row (matching MachineRowCard Tier 1)
  const tier1 = text("div", "flex min-w-0 items-center gap-3.5", "");
  const vesselWrap = text("div", "flex size-16 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/40 p-1.5", "");
  vesselWrap.append(createCylinderSvg(validPercent ? percent : null, "UNKNOWN", false, "size-14"));

  const idRow = text("div", "flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4", "");
  const titleMeta = text("div", "min-w-0", "");
  titleMeta.append(text("h2", "min-w-0 truncate text-base font-semibold leading-normal text-ink", device.label));
  const identity = text("dl", "mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2", "");
  for (const [label, detail] of [["Source", sourceText(device)], ["Device ID", device.source_id]]) {
    const field = text("div", "min-w-0", "");
    field.append(
      text("dt", "text-faint", label),
      text("dd", "mt-0.5 break-all text-muted", detail),
    );
    identity.append(field);
  }
  titleMeta.append(identity);

  const badgeWrap = text("div", "flex flex-wrap items-center gap-2 shrink-0", "");
  const freshPill = text("span", `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded border px-2.5 py-1 text-xs font-medium ${freshnessBadgeClass}`, "");
  freshPill.append(text("span", `size-2 rounded-full ${freshnessDotClass}`, ""), text("span", "", freshnessText(observation)));
  badgeWrap.append(freshPill);

  idRow.append(titleMeta, badgeWrap);
  tier1.append(vesselWrap, idRow);
  card.append(tier1);

  // Tier 2: Horizontal Telemetry & Provenance Reading Grid
  const tier2 = text("div", "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", "");

  const makeMetricPair = (label, key, unit, digits) => {
    const measured = reading(key);
    const item = text("div", "min-w-0", "");
    item.append(
      text("dt", "text-xs leading-normal text-muted truncate", label),
      text("dd", "mt-1 text-sm font-semibold leading-normal tabular-nums text-ink", number(measured, digits) + (measured === null ? "" : unit)),
    );
    return item;
  };

  // Box 1: Fuel Mass & Reported Level
  const fuelBox = text("div", "flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4", "");
  const levelTop = text("dl", "flex items-baseline justify-between gap-2", "");
  const measuredPct = reading("lpg_percent");
  levelTop.append(
    text("dt", "text-xs leading-normal text-muted", "Reported level"),
    text("dd", "text-sm font-semibold leading-normal tabular-nums text-ink", number(measuredPct, 1) + (measuredPct === null ? "" : "%")),
  );
  fuelBox.append(levelTop);
  if (validPercent) {
    fuelBox.append(createProgressBarSvg(percent, "fill-accent", "h-1.5 w-full overflow-hidden rounded-full bg-surface"));
  }
  const massGrid = text("dl", "grid grid-cols-2 gap-3 border-t border-rule/60 pt-2.5", "");
  massGrid.append(
    makeMetricPair("Gross mass", "gross_weight_kg", " kg", 2),
    makeMetricPair("Reported fuel", "lpg_weight_kg", " kg", 2),
  );
  fuelBox.append(massGrid);

  // Box 2: MQ-6 Gas Sensor Readings
  const gasBox = text("div", "flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4", "");
  const gasHead = text("div", "flex items-center gap-1.5 text-xs font-medium text-muted", "");
  gasHead.append(iconFlame("size-3.5 shrink-0 text-muted"), text("span", "", "MQ-6 gas sensor"));
  const gasGrid = text("dl", "grid grid-cols-2 gap-3 border-t border-rule/60 pt-2.5", "");
  gasGrid.append(
    makeMetricPair("MQ-6 raw ADC", "mq6_raw_adc", "", 0),
    makeMetricPair("MQ-6 voltage", "voltage", " V", 2),
  );
  gasBox.append(gasHead, gasGrid);

  // Box 3: Environment Readings (Temperature & Humidity)
  const envBox = text("div", "flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4", "");
  const envHead = text("div", "flex items-center gap-1.5 text-xs font-medium text-muted", "");
  envHead.append(iconThermometer("size-3.5 shrink-0 text-faint"), text("span", "", "Environment"));
  const envGrid = text("dl", "grid grid-cols-2 gap-3 border-t border-rule/60 pt-2.5", "");
  envGrid.append(
    makeMetricPair("Temperature", "temperature", " °C", 1),
    makeMetricPair("Humidity", "humidity", "%", 1),
  );
  envBox.append(envHead, envGrid);

  tier2.append(fuelBox, gasBox, envBox);
  card.append(tier2);

  const tier3 = text("dl", "grid grid-cols-1 gap-x-6 gap-y-2 border-t border-rule pt-3 text-xs sm:grid-cols-2", "");
  for (const [label, detail] of [["Last sample", lastUpdate(observation)], ["Cloud delivery", observation?.sync_state || "Unknown"]]) {
    const field = text("div", "min-w-0", "");
    field.append(text("dt", "text-faint", label), text("dd", "mt-0.5 text-muted", detail));
    tier3.append(field);
  }
  card.append(tier3);

  return card;
}

function renderSafety(snapshot) {
  const root = byId("safetyContent");
  const devices = snapshot.devices || [];
  root.replaceChildren();
  if (!devices.length) {
    root.append(empty("No approved LPG or safety nodes on this gateway."));
    return;
  }
  const section = text("section", "space-y-4", "");
  const heading = text("h2", "text-base font-semibold text-ink", "LPG & Safety nodes");
  const stack = text("div", "space-y-4", "");
  stack.setAttribute("role", "feed");
  stack.setAttribute("aria-label", "LPG & Safety node list");
  stack.append(...devices.map(safetyCard));
  section.append(heading, stack);
  root.append(section);
}
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  const button = byId("refreshButton");
  button.disabled = true;
  const endpoint = page === "overview" ? "/api/dashboard/overview" :
    page === "machines" ? "/api/dashboard/machines" : "/api/dashboard/lpg-safety";
  try {
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!response.ok) throw new Error("Local data unavailable");
    const snapshot = await response.json();
    renderGateway(snapshot);
    if (page === "overview") renderOverview(snapshot);
    if (page === "machines") renderMachines(snapshot);
    if (page === "safety") renderSafety(snapshot);
    if (page === "overview") await refreshHistory();
    byId("pageNotice").classList.add("hidden");
  } catch {
    byId("pageNotice").textContent = "Local data could not be refreshed. Any values shown are from the last successful check.";
    byId("pageNotice").classList.remove("hidden");
    byId("checkedAt").textContent = "Local data refresh failed";
  } finally {
    busy = false;
    button.disabled = false;
  }
}

const menu = byId("menuToggle");
menu.addEventListener("click", () => {
  const nav = byId("sideNav");
  const open = nav.classList.toggle("hidden") === false;
  nav.classList.toggle("flex", open);
  menu.setAttribute("aria-expanded", String(open));
});
byId("refreshButton").addEventListener("click", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
refresh();
setInterval(() => { if (!document.hidden && !paused) refresh(); }, 4000);

if (page === "overview") {
  byId("pauseButton").addEventListener("click", () => {
    paused = !paused;
    byId("pauseButton").setAttribute("aria-pressed", String(paused));
    byId("pauseButton").textContent = paused ? "Resume refresh" : "Pause refresh";
    if (!paused) refresh();
  });
  document.querySelectorAll("[data-history-filter]").forEach(button => button.addEventListener("click", () => {
    historyFilter = button.dataset.historyFilter;
    document.querySelectorAll("[data-history-filter]").forEach(item => {
      const selected = item === button;
      item.setAttribute("aria-pressed", String(selected));
      item.classList.toggle("bg-navy-selected", selected);
      item.classList.toggle("bg-navy", !selected);
    });
    renderHistory();
  }));
}

if (page === "overview" && new URLSearchParams(window.location.search).get("setup") === "1") {
  let setupCsrf = "";
  let setupLoginRequired = false;
  async function updateSetup() {
    if (setupLoginRequired) return;
    try {
      const response = await fetch("/api/setup/gateway", { cache: "no-store" });
      if (response.status === 401) {
        setupLoginRequired = true;
        byId("setupContent").classList.add("hidden");
        return;
      }
      if (!response.ok) throw new Error("Setup unavailable");
      const result = await response.json();
      setupCsrf = result.csrf_token || "";
      byId("setupContent").classList.remove("hidden");
      byId("setupState").textContent = `Pairing status: ${result.status || "unknown"}`;
      byId("pairingFormWrap").classList.toggle("hidden", result.status === "active" || result.status === "awaiting_confirmation");
      const fingerprint = byId("fingerprint");
      fingerprint.classList.toggle("hidden", result.status !== "awaiting_confirmation");
      fingerprint.textContent = result.verification_fingerprint
        ? `Compare fingerprint: ${result.verification_fingerprint}`
        : "Awaiting owner confirmation";
    } catch {
      byId("setupContent").classList.remove("hidden");
      byId("setupState").textContent = "Gateway setup status is unavailable";
    }
  }
  byId("pairingForm").addEventListener("submit", async event => {
    event.preventDefault();
    const code = byId("pairingCode").value.trim();
    const notice = byId("pairingNotice");
    notice.textContent = "Submitting pairing code";
    try {
      const response = await fetch("/api/setup/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Setup-CSRF": setupCsrf },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Pairing failed");
      byId("pairingCode").value = "";
      notice.textContent = "Code redeemed. Compare the fingerprint with the owner.";
      updateSetup();
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : "Pairing failed";
    }
  });
  updateSetup();
  setInterval(() => { if (!document.hidden) updateSetup(); }, 5000);
}
