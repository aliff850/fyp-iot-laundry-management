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
const iconBell = (cls = "size-4 shrink-0") => createIconSvg([["path", { d: "M10.268 21a2 2 0 0 0 3.464 0" }], ["path", { d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" }]], cls);

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

  svg.append(
    svgEl("rect", { x: "44", y: "6", width: "12", height: "6", rx: "1.5", "stroke-width": "2" }),
    svgEl("line", { x1: "50", y1: "12", x2: "50", y2: "18", "stroke-width": "2" }),
    svgEl("path", { d: "M 32 24 L 32 15 C 32 13 36 12 50 12 C 64 12 68 13 68 15 L 68 24", "stroke-width": "2" }),
    svgEl("line", { x1: "38", y1: "18", x2: "62", y2: "18", "stroke-width": "1.5" }),
    svgEl("rect", { x: "20", y: "24", width: "60", height: "68", rx: "8", "stroke-width": "2.5" }),
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
  const checkedAtDot = byId("checkedAtDot");
  if (checkedAtDot) checkedAtDot.className = "size-2 shrink-0 rounded-full bg-positive";
}

const ANALYTICS_REFRESH_INTERVAL_MS = 30000;
let overviewAnalyticsPeriod = "day";
let overviewMachineMetric = "cycles";
let latestOverviewAnalytics = null;
let lastAnalyticsRefreshAt = 0;
let analyticsRequestToken = 0;
const overviewCharts = { machine: null, revenue: null, gas: null, complaints: null, lpgTank: null };

function readThemePalette() {
  const css = typeof getComputedStyle === "function"
    ? getComputedStyle(document.documentElement)
    : { getPropertyValue: () => "" };
  const token = (name, fallback) => css.getPropertyValue(`--color-${name}`).trim() || fallback;
  return {
    accent: token("accent", "#2f6fed"),
    positive: token("positive", "#2ea043"),
    warning: token("warning", "#d29922"),
    negative: token("negative", "#f85149"),
    navySelected: token("navy-selected", "#1d4ed8"),
    control: token("control", "#30363d"),
    ink: token("ink", "#e6edf3"),
    muted: token("muted", "#8b949e"),
    rule: token("rule", "#21262d"),
    surface: token("surface", "#121923"),
  };
}

function chartAnimationDuration() {
  const reduce = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduce ? 0 : 220;
}

function destroyOverviewCharts() {
  for (const key of Object.keys(overviewCharts)) {
    if (overviewCharts[key] && typeof overviewCharts[key].destroy === "function") {
      overviewCharts[key].destroy();
    }
    overviewCharts[key] = null;
  }
}

function mountChart(key, canvasId, config) {
  if (overviewCharts[key] && typeof overviewCharts[key].destroy === "function") {
    overviewCharts[key].destroy();
    overviewCharts[key] = null;
  }
  const canvas = byId(canvasId);
  const ChartCtor = typeof Chart === "function" ? Chart : (typeof window !== "undefined" ? window.Chart : null);
  if (!canvas || typeof ChartCtor !== "function") return null;
  overviewCharts[key] = new ChartCtor(canvas, config);
  return overviewCharts[key];
}

function togglePanelState(wrapId, emptyId, emptyMessage) {
  const wrap = byId(wrapId);
  const emptyEl = byId(emptyId);
  if (emptyMessage) {
    if (emptyEl) {
      emptyEl.textContent = emptyMessage;
      emptyEl.classList.remove("hidden");
    }
    if (wrap) wrap.classList.add("hidden");
    return false;
  }
  if (emptyEl) {
    emptyEl.textContent = "";
    emptyEl.classList.add("hidden");
  }
  if (wrap) wrap.classList.remove("hidden");
  return true;
}

function renderMachineBreakdownTable(machines) {
  const tbody = byId("overviewMachineTableBody");
  if (!tbody) return;
  tbody.replaceChildren();
  if (!machines.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "px-3 py-3 text-center text-muted";
    cell.textContent = "No approved machines recorded";
    row.append(cell);
    tbody.append(row);
    return;
  }
  for (const machine of machines) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "px-3 py-2 font-medium text-ink";
    nameCell.textContent = machine.label || machine.source_id || "—";

    const cyclesCell = document.createElement("td");
    cyclesCell.className = "px-3 py-2 text-right tabular-nums text-ink";
    cyclesCell.textContent = String(machine.completed_cycles ?? 0);

    const minsCell = document.createElement("td");
    minsCell.className = "px-3 py-2 text-right tabular-nums text-ink";
    minsCell.textContent = Number(machine.running_minutes ?? 0).toFixed(1);

    const revCell = document.createElement("td");
    revCell.className = "px-3 py-2 text-right tabular-nums text-ink";
    revCell.textContent = Number(machine.estimated_revenue_myr ?? 0).toFixed(2);

    row.append(nameCell, cyclesCell, minsCell, revCell);
    tbody.append(row);
  }
}

function resolveMachinePrograms(data, machines) {
  if (Array.isArray(data?.programs) && data.programs.length) {
    return data.programs;
  }
  const seen = new Map();
  for (const machine of machines) {
    const byProg = machine?.cycles_by_program;
    if (!byProg || typeof byProg !== "object") continue;
    for (const pid of Object.keys(byProg)) {
      if (!seen.has(pid)) {
        const label = pid === "quick" ? "Quick" : pid === "standard" ? "Standard" : pid.replaceAll("_", " ");
        seen.set(pid, { program_id: pid, label });
      }
    }
  }
  return [...seen.values()];
}

function renderMachineMetricsChart(data) {
  if (!byId("overviewAnalyticsSection")) return;
  const palette = readThemePalette();
  const animDuration = chartAnimationDuration();
  const machines = Array.isArray(data?.machines) ? data.machines : [];
  const labelMap = {
    cycles: "Completed cycles by program",
    running: "Total running minutes by machine",
    revenue: "Estimated revenue by machine",
  };
  if (byId("overviewMachineChartLabel")) {
    byId("overviewMachineChartLabel").textContent = labelMap[overviewMachineMetric] || labelMap.cycles;
  }

  const showMachineChart = togglePanelState(
    "overviewMachineChartWrap",
    "overviewMachineEmpty",
    machines.length ? "" : "No approved machines for this gateway.",
  );
  if (!showMachineChart) {
    mountChart("machine", "overviewMachineChart", null);
    return;
  }

  const machineLabels = machines.map(m => m.label || m.source_id);
  const seriesColors = [palette.accent, palette.positive, palette.warning, palette.navySelected, palette.muted, palette.control];
  let datasets = [];
  let yTitle = "Cycles";
  let precision;
  let stacked = false;
  let showLegend = false;
  let suggestedMax;

  if (overviewMachineMetric === "cycles") {
    stacked = true;
    const programs = resolveMachinePrograms(data, machines);
    if (programs.length) {
      showLegend = true;
      datasets = programs.map((prog, index) => ({
        label: prog.label || prog.program_id,
        data: machines.map(m => Number(m.cycles_by_program?.[prog.program_id] || 0)),
        backgroundColor: seriesColors[index % seriesColors.length],
        borderRadius: 3,
        maxBarThickness: 48,
      }));
    } else {
      suggestedMax = 3;
      datasets = [{
        label: "Completed cycles",
        data: machines.map(() => 0),
        backgroundColor: palette.accent,
        borderRadius: 4,
        maxBarThickness: 48,
      }];
    }
    precision = 0;
  } else if (overviewMachineMetric === "running") {
    yTitle = "Minutes";
    datasets = [{
      label: "Running minutes",
      data: machines.map(m => Number(m.running_minutes || 0)),
      backgroundColor: palette.warning,
      borderRadius: 4,
      maxBarThickness: 48,
    }];
  } else {
    yTitle = "RM";
    datasets = [{
      label: "Estimated revenue (RM)",
      data: machines.map(m => Number(m.estimated_revenue_myr || 0)),
      backgroundColor: palette.positive,
      borderRadius: 4,
      maxBarThickness: 48,
    }];
  }

  const yTicks = { color: palette.muted, font: { size: 11 } };
  if (precision !== undefined) yTicks.precision = precision;

  mountChart("machine", "overviewMachineChart", {
    type: "bar",
    data: {
      labels: machineLabels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: animDuration },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: showLegend, labels: { color: palette.ink, boxWidth: 12, font: { size: 11 } } },
      },
      scales: {
        x: {
          stacked,
          ticks: { color: palette.muted, font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          stacked,
          beginAtZero: true,
          ...(suggestedMax !== undefined ? { suggestedMax } : {}),
          title: { display: true, text: yTitle, color: palette.muted, font: { size: 11 } },
          ticks: yTicks,
          grid: { color: palette.rule },
        },
      },
    },
  });
}

function updateMachineMetricButtons(activeMetric) {
  if (typeof document.querySelectorAll !== "function") return;
  document.querySelectorAll("[data-machine-metric]").forEach(button => {
    const selected = button.dataset.machineMetric === activeMetric;
    button.setAttribute("aria-pressed", String(selected));
    button.className = selected
      ? "min-h-11 rounded px-3 text-xs font-medium bg-accent text-white focus-visible:outline-2 focus-visible:outline-accent"
      : "min-h-11 rounded px-3 text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
  });
}

function renderOverviewAnalytics(data) {
  if (!byId("overviewAnalyticsSection")) return;
  latestOverviewAnalytics = data;
  const palette = readThemePalette();
  const animDuration = chartAnimationDuration();
  const summary = data?.summary || {};
  const machines = Array.isArray(data?.machines) ? data.machines : [];
  const revenueSeries = Array.isArray(data?.revenue_series) ? data.revenue_series : [];
  const gasSeries = data?.gas_series || {};
  const complaints = data?.complaints || {};

  if (byId("analyticsTotalCycles")) {
    byId("analyticsTotalCycles").textContent = summary.completed_cycles != null ? String(summary.completed_cycles) : "—";
  }
  if (byId("analyticsTotalMinutes")) {
    byId("analyticsTotalMinutes").textContent = summary.running_minutes != null
      ? `${Number(summary.running_minutes).toFixed(1)} min`
      : "—";
  }
  if (byId("analyticsTotalRevenue")) {
    byId("analyticsTotalRevenue").textContent = summary.estimated_revenue_myr != null
      ? `RM ${Number(summary.estimated_revenue_myr).toFixed(2)}`
      : "—";
  }
  if (byId("analyticsAvgGas")) {
    byId("analyticsAvgGas").textContent = summary.avg_gas_ppm != null
      ? `${Number(summary.avg_gas_ppm).toFixed(1)} ppm`
      : "—";
  }

  // 1. Toggleable machine metrics bar chart (Cycles stacked by program | Running min | Revenue RM) + table
  renderMachineBreakdownTable(machines);
  renderMachineMetricsChart(data);

  // 2. Cumulative estimated revenue line chart
  if (byId("overviewRevenueWindow")) {
    byId("overviewRevenueWindow").textContent = data?.granularity === "hour" ? "Hourly MYT" : "Daily MYT";
  }
  const showRevenueChart = togglePanelState(
    "overviewRevenueChartWrap",
    "overviewRevenueEmpty",
    revenueSeries.length ? "" : "No revenue timeline data available.",
  );
  if (showRevenueChart) {
    mountChart("revenue", "overviewRevenueChart", {
      type: "line",
      data: {
        labels: revenueSeries.map(pt => pt.label),
        datasets: [
          {
            label: "Cumulative revenue (RM)",
            data: revenueSeries.map(pt => Number(pt.cumulative_revenue_myr || 0)),
            borderColor: palette.positive,
            backgroundColor: "rgba(46, 160, 67, 0.16)",
            fill: true,
            tension: 0.2,
            pointRadius: revenueSeries.length > 15 ? 2 : 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: animDuration },
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: palette.muted, maxRotation: 0, autoSkip: true, font: { size: 11 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "RM", color: palette.muted, font: { size: 11 } },
            ticks: { color: palette.muted, font: { size: 11 } },
            grid: { color: palette.rule },
          },
        },
      },
    });
  }

  // 3. Average environmental gas PPM line chart (single-node passthrough or multi-node mean)
  const gasPoints = Array.isArray(gasSeries.series) ? gasSeries.series : [];
  const gasMode = gasSeries.aggregation_mode || "uncalibrated";
  const gasNodes = Array.isArray(gasSeries.nodes) ? gasSeries.nodes : [];
  const firstCalibrated = gasNodes.find(node => node.calibrated);
  const gasModeEl = byId("overviewGasMode");
  if (gasModeEl) {
    if (gasMode === "multi_node_average") {
      gasModeEl.textContent = `${gasSeries.node_count || 0} nodes averaged`;
    } else if (gasMode === "single_node") {
      gasModeEl.textContent = firstCalibrated ? (firstCalibrated.label || firstCalibrated.source_id) : "1 calibrated node";
    } else {
      gasModeEl.textContent = "Calibration required";
    }
  }
  const hasGasSample = gasPoints.some(pt => pt.avg_ppm !== null && pt.avg_ppm !== undefined);
  const gasEmptyMsg = gasMode === "uncalibrated"
    ? "Calibrate an LPG safety node to record environmental PPM."
    : (!hasGasSample ? "No valid gas samples recorded in this period." : "");
  const showGasChart = togglePanelState("overviewGasChartWrap", "overviewGasEmpty", gasEmptyMsg);
  if (showGasChart) {
    mountChart("gas", "overviewGasChart", {
      type: "line",
      data: {
        labels: gasPoints.map(pt => pt.label),
        datasets: [
          {
            label: "Avg gas (PPM)",
            data: gasPoints.map(pt => (pt.avg_ppm === null || pt.avg_ppm === undefined ? null : Number(pt.avg_ppm))),
            spanGaps: false,
            borderColor: palette.accent,
            backgroundColor: "rgba(47, 111, 237, 0.14)",
            fill: true,
            tension: 0.25,
            pointRadius: gasPoints.length > 15 ? 2 : 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: animDuration },
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: palette.muted, maxRotation: 0, autoSkip: true, font: { size: 11 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "PPM", color: palette.muted, font: { size: 11 } },
            ticks: { color: palette.muted, font: { size: 11 } },
            grid: { color: palette.rule },
          },
        },
      },
    });
  }

  // 4. Customer complaints received by period (deferred intake frame; never fabricated zeros)
  const complaintsImplemented = Boolean(complaints.implemented);
  const complaintLabels = complaintsImplemented && Array.isArray(complaints.series)
    ? complaints.series.map(pt => pt.label)
    : revenueSeries.map(pt => pt.label);
  const complaintValues = complaintsImplemented && Array.isArray(complaints.series)
    ? complaints.series.map(pt => Number(pt.count || 0))
    : complaintLabels.map(() => null);
  if (byId("overviewComplaintsMode")) {
    byId("overviewComplaintsMode").textContent = complaintsImplemented ? "Recorded reports" : "Intake pending";
  }
  const complaintStatusEl = byId("overviewComplaintsStatus");
  if (complaintStatusEl) {
    if (complaintsImplemented) {
      complaintStatusEl.textContent = "";
      complaintStatusEl.classList.add("hidden");
    } else {
      complaintStatusEl.textContent = "Customer complaint intake is not implemented yet.";
      complaintStatusEl.classList.remove("hidden");
    }
  }
  mountChart("complaints", "overviewComplaintsChart", {
    type: "bar",
    data: {
      labels: complaintLabels,
      datasets: [
        {
          label: "Complaints",
          data: complaintValues,
          backgroundColor: palette.warning,
          borderRadius: 4,
          maxBarThickness: 24,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: animDuration },
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: palette.muted, maxRotation: 0, autoSkip: true, font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 5,
          title: { display: true, text: "Count", color: palette.muted, font: { size: 11 } },
          ticks: { precision: 0, color: palette.muted, font: { size: 11 } },
          grid: { color: palette.rule },
        },
      },
    },
  });
}

async function refreshOverviewAnalytics(force = false) {
  if (!byId("overviewAnalyticsSection")) return;
  const nowMs = Date.now();
  if (!force && nowMs - lastAnalyticsRefreshAt < ANALYTICS_REFRESH_INTERVAL_MS) return;
  const requestId = ++analyticsRequestToken;
  const notice = byId("analyticsNotice");
  try {
    const response = await fetch(`/api/dashboard/overview/analytics?period=${encodeURIComponent(overviewAnalyticsPeriod)}`);
    if (!response.ok) throw new Error("Analytics unavailable");
    const payload = await response.json();
    if (requestId !== analyticsRequestToken) return;
    lastAnalyticsRefreshAt = Date.now();
    renderOverviewAnalytics(payload);
    if (notice) {
      notice.textContent = "";
      notice.classList.add("hidden");
    }
  } catch {
    if (requestId !== analyticsRequestToken) return;
    if (notice) {
      notice.textContent = "Operational analytics could not be refreshed. Any values shown are from the last successful check.";
      notice.classList.remove("hidden");
    }
  }
}

function updateAnalyticsPeriodButtons(activePeriod) {
  if (typeof document.querySelectorAll !== "function") return;
  document.querySelectorAll("[data-analytics-period]").forEach(button => {
    const selected = button.dataset.analyticsPeriod === activePeriod;
    button.setAttribute("aria-pressed", String(selected));
    button.className = selected
      ? "min-h-11 rounded px-3 text-xs font-medium bg-accent text-white focus-visible:outline-2 focus-visible:outline-accent"
      : "min-h-11 rounded px-3 text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
  });
}

function buildOverviewLpgTankEntries(safetyNodes, palette) {
  const nodes = Array.isArray(safetyNodes) ? safetyNodes : [];
  return nodes.map(node => {
    const label = node?.label || node?.source_id || "LPG node";
    const maintenance = Boolean(
      node?.maintenance_mode
      || node?.weight_evaluation_paused
      || String(node?.status || "").toLowerCase() === "maintenance"
    );
    const obs = node?.observation || null;
    const freshness = obs ? String(obs.freshness || "unknown") : "unknown";
    const quality = (obs && typeof obs.quality === "object" && obs.quality) || {};
    const values = (obs && typeof obs.values === "object" && obs.values) || {};
    const rawPercent = values.lpg_percent;
    const validPercent = typeof rawPercent === "number" && Number.isFinite(rawPercent) && rawPercent >= 0 && rawPercent <= 100
      ? rawPercent
      : null;

    let percent = null;
    let stateLabel = "No reading";
    let tone = "neutral";
    let barColor = palette.muted;

    if (maintenance) {
      stateLabel = "Maintenance";
      tone = "warning";
    } else if (!obs || freshness === "unknown") {
      stateLabel = "No reading";
    } else if (freshness === "offline") {
      stateLabel = "Offline";
      tone = "negative";
    } else if (freshness === "stale") {
      stateLabel = "Stale";
      tone = "warning";
    } else if (quality.weight_valid === false) {
      stateLabel = "Scale fault";
      tone = "negative";
    } else if (validPercent === null) {
      stateLabel = "Calibrate tank";
      tone = "warning";
    } else {
      percent = validPercent;
      stateLabel = `${validPercent.toFixed(1)}%`;
      if (validPercent < 5) {
        tone = "negative";
        barColor = palette.negative;
      } else if (validPercent < 15) {
        tone = "warning";
        barColor = palette.warning;
      } else {
        tone = "positive";
        barColor = palette.positive;
      }
    }

    const rawWeightKg = values.lpg_weight_kg;
    const weightLabel = percent !== null && typeof rawWeightKg === "number" && Number.isFinite(rawWeightKg)
      ? `${rawWeightKg.toFixed(2)} kg`
      : null;

    return {
      source_id: node?.source_id || label,
      label,
      percent,
      stateLabel,
      weightLabel,
      tone,
      barColor,
    };
  });
}

function renderOverviewLpgTankLevels(safetyNodes) {
  if (!byId("overviewLpgTankSection")) return;
  const palette = readThemePalette();
  const entries = buildOverviewLpgTankEntries(safetyNodes, palette);
  const liveCount = entries.filter(item => item.percent !== null).length;

  const statusEl = byId("overviewLpgTankStatus");
  if (statusEl) {
    if (!entries.length) {
      statusEl.textContent = "No LPG nodes";
    } else if (liveCount === entries.length) {
      statusEl.textContent = `${liveCount} live ${liveCount === 1 ? "node" : "nodes"}`;
    } else {
      statusEl.textContent = `${liveCount} of ${entries.length} live`;
    }
  }

  const listEl = byId("overviewLpgTankDetails");
  if (listEl) {
    listEl.replaceChildren();
    for (const item of entries) {
      const li = document.createElement("li");
      li.className = "flex min-w-0 items-center justify-between gap-2 rounded-md border border-rule bg-raised px-3 py-2";
      const nameEl = text("span", "truncate font-medium text-ink", item.label);
      const rightEl = document.createElement("span");
      const toneClass = item.tone === "positive"
        ? "text-positive"
        : item.tone === "warning"
          ? "text-warning"
          : item.tone === "negative"
            ? "text-negative"
            : "text-muted";
      rightEl.className = `shrink-0 font-semibold tabular-nums ${toneClass}`;
      rightEl.textContent = item.weightLabel ? `${item.stateLabel} (${item.weightLabel})` : item.stateLabel;
      li.append(nameEl, rightEl);
      listEl.append(li);
    }
    listEl.classList.toggle("hidden", entries.length === 0);
  }

  const showChart = togglePanelState(
    "overviewLpgTankChartWrap",
    "overviewLpgTankEmpty",
    entries.length ? "" : "No LPG edge nodes paired locally.",
  );
  if (!showChart) {
    if (overviewCharts.lpgTank && typeof overviewCharts.lpgTank.destroy === "function") {
      overviewCharts.lpgTank.destroy();
      overviewCharts.lpgTank = null;
    }
    return;
  }

  const horizontal = entries.length > 4;
  const categoryAxis = {
    ticks: { color: palette.muted, font: { size: 11 } },
    grid: { display: false },
  };
  const percentAxis = {
    min: 0,
    max: 100,
    title: { display: true, text: "Tank level (%)", color: palette.muted, font: { size: 11 } },
    ticks: {
      color: palette.muted,
      font: { size: 11 },
      callback: value => `${value}%`,
    },
    grid: { color: palette.rule },
  };

  mountChart("lpgTank", "overviewLpgTankChart", {
    type: "bar",
    data: {
      labels: entries.map(item => item.label),
      datasets: [
        {
          label: "Gas tank level (%)",
          data: entries.map(item => item.percent),
          backgroundColor: entries.map(item => item.barColor),
          borderRadius: 4,
          maxBarThickness: 48,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      animation: { duration: chartAnimationDuration() },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const entry = entries[ctx.dataIndex];
              if (!entry) return "";
              return entry.weightLabel ? `${entry.stateLabel} (${entry.weightLabel})` : entry.stateLabel;
            },
          },
        },
      },
      scales: horizontal
        ? { x: percentAxis, y: categoryAxis }
        : { x: categoryAxis, y: percentAxis },
    },
  });
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
  renderOverviewLpgTankLevels(snapshot.safety_nodes || []);
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
let historyCategory = "lpg";
const historyViewState = {
  lpg: { page: 1, period: "all", delivery: "all" },
  machine: { page: 1, period: "all", delivery: "all" },
};
let historyPageMeta = { page: 1, page_size: 10, total: 0, total_pages: 1 };
let historyRequestSeq = 0;
let paused = false;

function syncHistoryControls() {
  const viewState = historyViewState[historyCategory] || historyViewState.lpg;
  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll("[data-history-category]").forEach(item => {
      const selected = item.dataset.historyCategory === historyCategory;
      item.setAttribute("aria-pressed", String(selected));
      item.classList.toggle("bg-navy-selected", selected);
      item.classList.toggle("bg-navy", !selected);
    });
    document.querySelectorAll("[data-history-filter]").forEach(item => {
      const selected = item.dataset.historyFilter === viewState.delivery;
      item.setAttribute("aria-pressed", String(selected));
      item.classList.toggle("bg-navy-selected", selected);
      item.classList.toggle("bg-navy", !selected);
    });
  }
  const periodSelect = byId("historyPeriod");
  if (periodSelect && periodSelect.value !== viewState.period) {
    periodSelect.value = viewState.period;
  }
}

function renderHistory() {
  const rows = byId("historyRows");
  const countEl = byId("historyCount");
  const pageLabel = byId("historyPageLabel");
  const prevBtn = byId("historyPrevPage");
  const nextBtn = byId("historyNextPage");
  if (!rows) return;
  rows.replaceChildren();
  const viewState = historyViewState[historyCategory] || historyViewState.lpg;
  const catLabel = historyCategory === "lpg" ? "LPG records" : "machine records";
  if (historyRecords === null) {
    const row = document.createElement("tr");
    const cell = text("td", "px-3 py-4 text-muted", "Recent records unavailable");
    cell.colSpan = 4;
    row.append(cell);
    rows.append(row);
    if (countEl) countEl.textContent = `0 ${catLabel}`;
    if (pageLabel) pageLabel.textContent = "Page 1 of 1";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }
  const shown = historyRecords;
  if (!shown.length) {
    const row = document.createElement("tr");
    const hasFilters = viewState.delivery !== "all" || viewState.period !== "all";
    const emptyText = hasFilters
      ? "No records match these filters"
      : (historyCategory === "lpg" ? "No local LPG node records for this gateway" : "No local machine records for this gateway");
    const cell = text("td", "px-3 py-4 text-muted", emptyText);
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
  const metaPage = Math.max(1, Number(historyPageMeta.page) || 1);
  const metaPages = Math.max(1, Number(historyPageMeta.total_pages) || 1);
  const metaSize = Math.max(1, Number(historyPageMeta.page_size) || 10);
  const metaTotal = Math.max(0, Number(historyPageMeta.total) || 0);
  if (countEl) {
    if (shown.length > 0 && metaTotal > 0) {
      const startIdx = (metaPage - 1) * metaSize + 1;
      const endIdx = Math.min(metaTotal, startIdx + shown.length - 1);
      countEl.textContent = `Showing ${startIdx}–${endIdx} of ${metaTotal} ${catLabel}`;
    } else {
      countEl.textContent = `0 ${catLabel}`;
    }
    countEl.classList.remove("hidden");
  }
  if (pageLabel) pageLabel.textContent = `Page ${metaPage} of ${metaPages}`;
  if (prevBtn) prevBtn.disabled = metaPage <= 1;
  if (nextBtn) nextBtn.disabled = metaPage >= metaPages;
}

async function refreshHistory() {
  const reqSeq = ++historyRequestSeq;
  const reqCategory = historyCategory;
  const viewState = historyViewState[reqCategory] || historyViewState.lpg;
  const params = new URLSearchParams({
    category: reqCategory,
    period: viewState.period,
    delivery: viewState.delivery,
    page: String(viewState.page),
  });
  try {
    const response = await fetch(`/api/dashboard/history?${params.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("History unavailable");
    const result = await response.json();
    if (!Array.isArray(result.records)) throw new Error("Malformed history");
    if (reqSeq !== historyRequestSeq || reqCategory !== historyCategory) return;
    if (typeof result.total === "number" && typeof result.total_pages === "number") {
      const serverPage = Math.max(1, Number(result.page) || 1);
      viewState.page = serverPage;
      historyPageMeta = {
        page: serverPage,
        page_size: Number(result.page_size) || 10,
        total: result.total,
        total_pages: Math.max(1, result.total_pages),
      };
      historyRecords = result.records;
    } else {
      // Legacy array-only mock compatibility fallback
      const filtered = result.records.filter(rec => viewState.delivery === "all" || rec.sync_state === viewState.delivery);
      historyPageMeta = { page: 1, page_size: 10, total: filtered.length, total_pages: 1 };
      historyRecords = filtered;
    }
    byId("historyNotice").classList.add("hidden");
    syncHistoryControls();
    renderHistory();
  } catch {
    if (reqSeq !== historyRequestSeq) return;
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

async function fetchLpgMaintenanceStatus(sourceId) {
  const response = await fetch(`/api/dashboard/lpg/${encodeURIComponent(sourceId)}/maintenance-status`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to load tank swap status");
  return payload;
}

async function postLpgAction(sourceId, actionPath, body = {}) {
  const response = await fetch(`/api/dashboard/lpg/${encodeURIComponent(sourceId)}/${actionPath}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Staff-CSRF": document.body.dataset.staffCsrf || "",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    const err = new Error(payload.error || "LPG request failed");
    err.payload = payload;
    throw err;
  }
  return payload;
}

function openLpgDialog(titleText, nodeLabel, buildBody) {
  const dialog = text(
    "dialog",
    "fixed inset-0 z-50 m-auto hidden max-h-[90vh] w-[calc(100%-1.5rem)] max-w-lg flex-col overflow-hidden rounded-md border border-control bg-surface p-4 text-ink shadow-2xl backdrop:bg-canvas/80 open:flex sm:p-6",
    "",
  );
  const titleId = `lpg-dialog-title-${Date.now()}`;
  dialog.setAttribute("aria-labelledby", titleId);

  const header = text("div", "flex items-start justify-between gap-3 border-b border-rule pb-3", "");
  const headerText = text("div", "min-w-0 space-y-0.5", "");
  const titleEl = text("h2", "min-w-0 truncate text-base font-semibold text-ink sm:text-lg", titleText);
  titleEl.id = titleId;
  headerText.append(titleEl);
  if (nodeLabel) {
    headerText.append(text("p", "min-w-0 truncate text-xs text-muted", nodeLabel));
  }
  const closeBtn = text(
    "button",
    "flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-raised/40 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
    "",
  );
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close dialog");
  closeBtn.append(text("span", "text-lg leading-none", "×"));
  header.append(headerText, closeBtn);

  const errorBox = text("div", "hidden rounded-md border border-negative/40 bg-negative/10 p-3 text-xs text-negative", "");
  errorBox.setAttribute("role", "alert");

  const bodyWrap = text("div", "mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto", "");
  const footerWrap = text("div", "mt-4 flex flex-col-reverse gap-2.5 border-t border-rule pt-4 sm:flex-row sm:flex-wrap sm:justify-end", "");

  const closeDialog = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  closeBtn.addEventListener("click", closeDialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeDialog();
  });

  const setError = msg => {
    if (!msg) {
      errorBox.classList.add("hidden");
      errorBox.textContent = "";
    } else {
      errorBox.textContent = msg;
      errorBox.classList.remove("hidden");
    }
  };

  buildBody({ bodyWrap, footerWrap, setError, closeDialog });
  bodyWrap.prepend(errorBox);
  dialog.append(header, bodyWrap);
  if (footerWrap.childElementCount > 0) dialog.append(footerWrap);
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function makeLpgField(labelText, inputType, defaultValue, opts = {}) {
  const wrap = text("div", "space-y-1.5", "");
  const inputId = `lpg-field-${Math.random().toString(36).slice(2, 9)}`;
  const label = text("label", "block text-xs font-medium text-muted", labelText);
  label.htmlFor = inputId;
  const input = document.createElement("input");
  input.id = inputId;
  input.type = inputType;
  if (defaultValue !== null && defaultValue !== undefined) input.value = String(defaultValue);
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.step) input.step = opts.step;
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  if (opts.maxLength) input.maxLength = opts.maxLength;
  input.className = "min-h-11 w-full rounded-md border border-control bg-raised/60 px-3 py-2 text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent";
  wrap.append(label, input);
  return { wrap, input };
}

function openStartMaintenanceModal(device) {
  openLpgDialog("Start tank swap", device.label, ({ bodyWrap, footerWrap, setError, closeDialog }) => {
    const infoBox = text(
      "div",
      "rounded-md border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-ink",
      "Weight fuel alerts for this cylinder are paused during maintenance. MQ-6 gas leak and ambient temperature monitoring stay active.",
    );
    const staffField = makeLpgField("Staff name", "text", "Local staff", { maxLength: 80 });
    const noteField = makeLpgField("Service note", "text", "", { placeholder: "Supplier cylinder exchange", maxLength: 240 });
    bodyWrap.append(infoBox, staffField.wrap, noteField.wrap);

    const cancelBtn = text(
      "button",
      "min-h-11 w-full rounded-md border border-control bg-raised/60 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
      "Cancel",
    );
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", closeDialog);

    const submitBtn = text(
      "button",
      "min-h-11 w-full rounded-md border border-warning/40 bg-warning/15 px-4 py-2 text-sm font-semibold text-warning transition-colors hover:bg-warning/25 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
      "Confirm start swap",
    );
    submitBtn.type = "button";
    submitBtn.addEventListener("click", async () => {
      submitBtn.disabled = true;
      setError("");
      try {
        await postLpgAction(device.source_id, "maintenance/start", {
          started_by: staffField.input.value.trim() || "Local staff",
          service_note: noteField.input.value.trim(),
        });
        closeDialog();
        await refresh();
      } catch (err) {
        setError(err.message || "Could not start maintenance");
        submitBtn.disabled = false;
      }
    });

    footerWrap.append(cancelBtn, submitBtn);
  });
}

function openCompleteMaintenanceModal(device) {
  openLpgDialog("Complete tank swap", device.label, ({ bodyWrap, footerWrap, setError, closeDialog }) => {
    const cfg = device.lpg_config || {};
    const statusBox = text("div", "space-y-2.5 rounded-md border border-line bg-raised/40 p-3.5", "");
    const statusTop = text("div", "flex flex-wrap items-center justify-between gap-2", "");
    const statusHeading = text("span", "text-xs font-medium text-muted", "Scale stability verification");
    const recheckBtn = text(
      "button",
      "min-h-11 rounded-md border border-control bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent",
      "Re-check scale",
    );
    recheckBtn.type = "button";
    statusTop.append(statusHeading, recheckBtn);

    const statusGrid = text("dl", "grid grid-cols-1 gap-2.5 border-t border-rule/60 pt-2.5 sm:grid-cols-3", "");
    const stateVal = text("dd", "mt-0.5 text-sm font-semibold text-muted", "Checking...");
    const samplesVal = text("dd", "mt-0.5 text-sm font-semibold tabular-nums text-ink", "0 / 3");
    const meanVal = text("dd", "mt-0.5 text-sm font-semibold tabular-nums text-ink", "—");
    for (const [dtText, ddNode] of [
      ["Scale state", stateVal],
      ["Fresh valid samples", samplesVal],
      ["Mean / spread", meanVal],
    ]) {
      const col = text("div", "min-w-0", "");
      col.append(text("dt", "text-xs text-faint", dtText), ddNode);
      statusGrid.append(col);
    }
    const reasonText = text("p", "text-xs text-muted", "Checking recent load-cell readings...");
    statusBox.append(statusTop, statusGrid, reasonText);

    const formGrid = text("div", "grid grid-cols-1 gap-3 sm:grid-cols-2", "");
    const tareField = makeLpgField("New tare weight (kg, optional)", "number", cfg.cylinder_tare_kg ?? "", {
      placeholder: "e.g. 16.5",
      step: "0.01",
      min: 0.5,
      max: 200,
    });
    const capField = makeLpgField(
      "Rated LPG capacity (kg, optional)",
      "number",
      cfg.rated_capacity_kg ?? device.capacity_kg ?? "",
      { placeholder: "e.g. 14.0 or 50.0", step: "0.01", min: 1, max: 500 },
    );
    formGrid.append(tareField.wrap, capField.wrap);

    const staffField = makeLpgField("Completed by", "text", "Local staff", { maxLength: 80 });
    bodyWrap.append(statusBox, formGrid, staffField.wrap);

    const renderStability = stability => {
      const stable = Boolean(stability?.stable);
      stateVal.textContent = stable ? "Stable" : "Waiting";
      stateVal.className = `mt-0.5 text-sm font-semibold ${stable ? "text-positive" : "text-warning"}`;
      samplesVal.textContent = `${stability?.sample_count ?? 0} / ${stability?.required_count ?? 3}`;
      meanVal.textContent =
        stability?.mean_gross_kg != null
          ? `${number(stability.mean_gross_kg, 2)} kg (±${number(stability.spread_kg, 2)})`
          : "—";
      reasonText.textContent = stability?.reason || "";
    };

    const loadStatus = async () => {
      recheckBtn.disabled = true;
      try {
        const data = await fetchLpgMaintenanceStatus(device.source_id);
        renderStability(data.stability);
      } catch (err) {
        reasonText.textContent = err.message || "Unable to verify scale stability";
      } finally {
        recheckBtn.disabled = false;
      }
    };
    recheckBtn.addEventListener("click", loadStatus);

    const cancelBtn = text(
      "button",
      "min-h-11 w-full rounded-md border border-control bg-raised/60 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
      "Cancel",
    );
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", closeDialog);

    const submitBtn = text(
      "button",
      "min-h-11 w-full rounded-md border border-positive/40 bg-positive/15 px-4 py-2 text-sm font-semibold text-positive transition-colors hover:bg-positive/25 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
      "Complete tank swap",
    );
    submitBtn.type = "button";
    submitBtn.addEventListener("click", async () => {
      submitBtn.disabled = true;
      setError("");
      try {
        await postLpgAction(device.source_id, "maintenance/complete", {
          completed_by: staffField.input.value.trim() || "Local staff",
          tare_kg: tareField.input.value === "" ? null : Number(tareField.input.value),
          rated_capacity_kg: capField.input.value === "" ? null : Number(capField.input.value),
        });
        closeDialog();
        await refresh();
      } catch (err) {
        if (err.payload?.stability) renderStability(err.payload.stability);
        setError(err.message || "Swap verification failed");
        submitBtn.disabled = false;
      }
    });

    footerWrap.append(cancelBtn, submitBtn);
    loadStatus();
  });
}

function openGasBaselineModal(device) {
  openLpgDialog("Calibrate clean air", device.label, ({ bodyWrap, footerWrap, setError, closeDialog }) => {
    const cfg = device.lpg_config || {};
    const gasInfo = device.gas_interpretation || {};
    const freshVoltage = device.observation?.freshness === "fresh" ? value(device.observation, "voltage") : null;
    const estPpm = device.observation?.freshness === "fresh" ? value(device.observation, "estimated_ppm") : null;
    const validEst = typeof estPpm === "number" && Number.isFinite(estPpm);

    const currentBox = text("dl", "grid grid-cols-1 gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 sm:grid-cols-2", "");
    const readinessVal = freshVoltage === null ? "Sensor offline" : "Live signal ready";
    const readinessClass = freshVoltage === null ? "mt-0.5 text-sm font-semibold text-warning" : "mt-0.5 text-sm font-semibold text-positive";
    const calVal = gasInfo.ppm_calibrated
      ? (validEst ? `Calibrated (${number(estPpm, estPpm < 100 ? 1 : 0)} ppm)` : "Calibrated")
      : "Needs calibration";
    const calClass = gasInfo.ppm_calibrated ? "mt-0.5 text-sm font-semibold text-ink tabular-nums" : "mt-0.5 text-sm font-semibold text-warning";

    for (const [dtText, ddText, ddClass] of [
      ["Sensor signal", readinessVal, readinessClass],
      ["Gas sensor status", calVal, calClass],
    ]) {
      const col = text("div", "min-w-0", "");
      col.append(
        text("dt", "text-xs text-faint", dtText),
        text("dd", ddClass, ddText),
      );
      currentBox.append(col);
    }

    const note = text(
      "div",
      "rounded-md border border-line bg-raised/20 p-3.5 text-xs leading-relaxed text-muted",
      "One-time setup after installing or replacing the LPG gas sensor. Ensure the laundry room is ventilated with no gas smell present before calibrating.",
    );

    const thresholdsGrid = text("div", "grid grid-cols-1 gap-3 sm:grid-cols-2", "");
    const warnField = makeLpgField("Warning alert (ppm)", "number", cfg.gas_warn_ppm ?? 20, { step: "1", min: 10, max: 10000 });
    const critField = makeLpgField("Critical alert (ppm)", "number", cfg.gas_crit_ppm ?? 80, { step: "1", min: 20, max: 20000 });
    thresholdsGrid.append(warnField.wrap, critField.wrap);

    const advancedDetails = document.createElement("details");
    advancedDetails.className = "rounded-md border border-rule bg-raised/20";
    const advancedSummary = text(
      "summary",
      "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
      "Advanced circuit settings (maintenance crew)",
    );
    const advancedBody = text("div", "space-y-3 border-t border-rule/60 p-3.5", "");
    const circuitStats = text("dl", "grid grid-cols-2 gap-3", "");
    for (const [label, val] of [
      ["Voltage", freshVoltage === null ? "Unavailable" : `${number(freshVoltage, 2)} V`],
      ["Saved baseline R0", cfg.mq6_ro_kohm != null ? `${number(cfg.mq6_ro_kohm, 2)} kΩ` : "None"],
    ]) {
      const col = text("div", "min-w-0", "");
      col.append(
        text("dt", "text-xs text-faint", label),
        text("dd", "mt-0.5 text-xs font-medium tabular-nums text-muted", val),
      );
      circuitStats.append(col);
    }
    const formGrid = text("div", "grid grid-cols-1 gap-3 sm:grid-cols-3", "");
    const rlField = makeLpgField("Load RL (kΩ)", "number", cfg.mq6_rl_kohm ?? 20, { step: "0.1", min: 0.1, max: 200 });
    const divField = makeLpgField("Divider ratio", "number", cfg.mq6_divider_ratio ?? 1, { step: "0.01", min: 0.1, max: 10 });
    const vccField = makeLpgField("Supply (V)", "number", cfg.mq6_vcc_v ?? 5, { step: "0.1", min: 2.5, max: 12 });
    formGrid.append(rlField.wrap, divField.wrap, vccField.wrap);
    advancedBody.append(circuitStats, formGrid);
    advancedDetails.append(advancedSummary, advancedBody);

    bodyWrap.append(currentBox, note, thresholdsGrid, advancedDetails);

    const actionButtons = [];
    const buildPayload = () => ({
      rl_kohm: Number(rlField.input.value),
      divider_ratio: Number(divField.input.value),
      vcc_v: Number(vccField.input.value),
      gas_warn_ppm: Number(warnField.input.value),
      gas_crit_ppm: Number(critField.input.value),
    });
    const runCalibrationAction = async (payload, triggerBtn, fallbackError) => {
      for (const b of actionButtons) b.disabled = true;
      setError("");
      try {
        await postLpgAction(device.source_id, "gas-baseline", payload);
        closeDialog();
        await refresh();
      } catch (err) {
        setError(err.message || fallbackError);
        for (const b of actionButtons) b.disabled = false;
      }
    };

    const cancelBtn = text(
      "button",
      "min-h-11 w-full rounded-md border border-control bg-raised/60 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
      "Cancel",
    );
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", closeDialog);

    if (cfg.mq6_ro_kohm != null) {
      const resetBtn = text(
        "button",
        "min-h-11 w-full rounded-md border border-line bg-raised/40 px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
        "Clear calibration",
      );
      resetBtn.type = "button";
      resetBtn.addEventListener("click", () => runCalibrationAction({ reset: true }, resetBtn, "Could not clear calibration"));
      actionButtons.push(resetBtn);

      const saveLimitsBtn = text(
        "button",
        "min-h-11 w-full rounded-md border border-control bg-raised/60 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
        "Save alert limits",
      );
      saveLimitsBtn.type = "button";
      saveLimitsBtn.addEventListener("click", () => runCalibrationAction({ ...buildPayload(), save_settings_only: true }, saveLimitsBtn, "Could not save alert limits"));
      actionButtons.push(saveLimitsBtn);
      footerWrap.append(resetBtn, saveLimitsBtn);
    }

    const submitBtn = text(
      "button",
      "min-h-11 w-full rounded-md border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/25 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
      "Calibrate clean air",
    );
    submitBtn.type = "button";
    submitBtn.addEventListener("click", () => runCalibrationAction(buildPayload(), submitBtn, "Could not calibrate clean air"));
    actionButtons.push(submitBtn);

    footerWrap.append(cancelBtn, submitBtn);
  });
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
  const { observation, isFresh, badge, effectiveStatus, settings, isWasher, remainingSecs, remainingMins } = computed;
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
  titleRow.append(dialogTitle, capBadge);

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
      text("p", "text-sm text-ink", "Review the simulated fault before using CLEAR FAULT."),
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

  const stateSummary = text("dl", "grid grid-cols-1 gap-3 sm:grid-cols-2", "");
  const remainingDisplay = isFresh && remainingSecs !== null && ["RUNNING", "PAUSED"].includes(effectiveStatus)
    ? `${remainingSecs} s (${remainingMins} min)` : "—";
  for (const [label, detail] of [
    ["Machine status", badge.label],
    ["Remaining estimate", remainingDisplay],
  ]) {
    const field = text("div", "min-w-0 rounded-md border border-line bg-raised/40 p-3.5", "");
    field.append(text("dt", "text-sm text-muted", label),
      text("dd", "mt-1 break-words text-base font-medium text-ink tabular-nums", detail));
    stateSummary.append(field);
  }
  diagPanel.append(stateSummary);

  // Actual measurements are unavailable until a provider supplies verified readings.
  const sensorGrid = text("dl", "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4", "");
  const addSensorTile = (lbl, mainVal) => {
    const tile = text("div", "rounded-md border border-rule bg-raised/30 p-3.5", "");
    tile.append(
      text("dt", "text-xs text-muted", lbl),
      text("dd", "mt-1 text-lg font-bold text-ink tabular-nums", mainVal),
    );
    sensorGrid.append(tile);
  };

  if (isWasher) {
    addSensorTile("Water level", "Unavailable");
    addSensorTile("Temperature", "Unavailable");
  }
  addSensorTile("Spin speed", "Unavailable");
  addSensorTile("Door Interlock", "Unavailable");
  diagPanel.append(sensorGrid);

  // Operator Command Bar
  const cmdPanel = text("div", "rounded-md border border-line bg-surface p-4 space-y-4", "");
  cmdPanel.append(text("h3", "text-xs font-semibold text-ink", "Operator Diagnostics & Controls"));
  const cmdStatus = text("p", "text-xs text-muted", enabled ? "Ready to dispatch local machine commands." : "Controls not enabled for this device.");
  cmdStatus.setAttribute("role", "status");

  const programField = text("label", "flex w-full max-w-sm flex-col gap-2 text-sm font-medium text-ink", "Program for START");
  const programSelect = text("select", "min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted", "");
  const availablePrograms = Object.keys(observation?.programs || {}).filter(id =>
    observation?.programs?.[id] && typeof observation.programs[id] === "object",
  );
  const emptyOption = text("option", "", availablePrograms.length ? "Select a program" : "No saved programs");
  emptyOption.value = "";
  programSelect.append(emptyOption);
  for (const id of availablePrograms) {
    const option = text("option", "", observation.programs[id].name || (id === "quick" ? "Quick" : id === "standard" ? "Standard" : id));
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
        ? `Start ${observation?.programs?.[programId]?.name || (programId === "quick" ? "Quick" : programId === "standard" ? "Standard" : programId)} on ${device.label}?`
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

  cmdPanel.append(cmdStatus);
  diagPanel.append(cmdPanel);

  const historyWrap = text("section", "rounded-md border border-line bg-surface p-4 space-y-4", "");
  historyWrap.append(text("h3", "text-base font-semibold text-ink", "Recent commands"));
  const historyFilter = text("label", "flex w-full flex-col gap-2 text-sm font-medium text-ink sm:max-w-xs", "Timeframe");
  const historyPeriod = text("select", "min-h-11 w-full rounded-md border border-control bg-canvas px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent", "");
  for (const [value, label] of [["today", "Today"], ["week", "Past 7 days"], ["month", "Past 30 days"], ["all", "All time"]]) {
    const option = text("option", "", label);
    option.value = value;
    historyPeriod.append(option);
  }
  historyPeriod.value = "week";
  historyPeriod.disabled = !enabled;
  historyFilter.append(historyPeriod);
  historyWrap.append(historyFilter);
  const historyList = text("ul", "space-y-2", "");
  historyList.setAttribute("aria-live", "polite");
  historyWrap.append(historyList);
  const historyPager = text("div", "flex flex-col gap-2 border-t border-rule pt-3 sm:flex-row sm:items-center sm:justify-between", "");
  const historyPageLabel = text("p", "text-sm text-muted tabular-nums", "Page 1 of 1");
  const historyButtons = text("div", "flex gap-2", "");
  const pagerClass = "min-h-11 min-w-11 rounded-md border border-control bg-navy px-4 text-sm font-medium text-ink enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted";
  const previousPage = text("button", pagerClass, "Previous");
  const nextPage = text("button", pagerClass, "Next");
  previousPage.type = nextPage.type = "button";
  previousPage.disabled = nextPage.disabled = true;
  historyButtons.append(previousPage, nextPage);
  historyPager.append(historyPageLabel, historyButtons);
  historyWrap.append(historyPager);
  diagPanel.append(historyWrap);

  let historyPage = 1;
  let historyPages = 1;
  let historyRequest = 0;
  const loadHistory = async () => {
    const requestId = ++historyRequest;
    historyList.replaceChildren(text("li", "text-sm text-muted", "Loading commands"));
    previousPage.disabled = nextPage.disabled = true;
    try {
      const query = new URLSearchParams({ period: historyPeriod.value, page: String(historyPage) });
      const response = await fetch(`/api/dashboard/machines/${encodeURIComponent(device.source_id)}/commands?${query}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Command history unavailable");
      const payload = await response.json();
      if (requestId !== historyRequest) return;
      if (!Array.isArray(payload.commands) || !Number.isInteger(payload.page) || !Number.isInteger(payload.total_pages)) throw new Error("Command history unavailable");
      historyPage = payload.page;
      historyPages = payload.total_pages;
      historyList.replaceChildren();
      for (const item of payload.commands) {
        const row = text("li", "min-w-0 rounded-md border border-line bg-raised/40 p-3", "");
        const fields = text("dl", "grid grid-cols-1 gap-3 sm:grid-cols-3", "");
        for (const [label, value] of [["Action", item.action?.replaceAll("_", " ") || "Unknown"], ["Result", item.status || "Unknown"], ["Issued", dateLabel(item.issued_at)]]) {
          const field = text("div", "min-w-0", "");
          field.append(text("dt", "text-xs text-muted", label), text("dd", "mt-1 break-words text-sm text-ink", value));
          fields.append(field);
        }
        row.append(fields);
        if (item.reason) row.append(text("p", "mt-2 text-sm text-warning", item.reason));
        historyList.append(row);
      }
      if (!payload.commands.length) historyList.append(text("li", "text-sm text-muted", "No commands in this timeframe"));
      historyPageLabel.textContent = `Page ${historyPage} of ${historyPages}`;
      previousPage.disabled = historyPage <= 1;
      nextPage.disabled = historyPage >= historyPages;
    } catch {
      if (requestId !== historyRequest) return;
      historyList.replaceChildren(text("li", "text-sm text-warning", "Command history unavailable"));
    }
  };
  historyPeriod.addEventListener("change", () => { historyPage = 1; loadHistory(); });
  previousPage.addEventListener("click", () => { if (historyPage > 1) { historyPage -= 1; loadHistory(); } });
  nextPage.addEventListener("click", () => { if (historyPage < historyPages) { historyPage += 1; loadHistory(); } });
  if (enabled) loadHistory();
  else historyList.append(text("li", "text-sm text-muted", "Local command history is unavailable"));

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
        const completedPrograms = [...new Set(events.filter(event => event.outcome === "completed").map(event => event.program_id))];
        const palette = ["accent", "positive", "warning", "navy-selected", "muted", "control"];
        const datasets = metric === "cycles" ? completedPrograms.map((id, index) => ({
          label: id === "quick" ? "Quick" : id === "standard" ? "Standard" : id,
          data: statsData.series.map(row => events.filter(event => event.outcome === "completed" && event.program_id === id && event.local_date === row.timestamp).length),
          backgroundColor: color(palette[index % palette.length]), borderRadius: 3,
        })) : [{ label: metric === "running" ? "Running minutes" : "Estimated revenue (RM)",
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

  // Saved programs come from the ESP32's confirmed state, not local form drafts.
  const progsPanel = text("div", "hidden space-y-3", "");
  tabPanels.programs = progsPanel;
  const catalogHead = text("div", "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", "");
  catalogHead.append(text("h3", "text-base font-semibold text-ink", "Saved programs"));
  const addProgramButton = text("button", "min-h-11 min-w-11 rounded-md border border-control bg-navy px-4 text-sm font-semibold text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:bg-raised disabled:text-muted", "Add program");
  addProgramButton.type = "button";
  catalogHead.append(addProgramButton);
  const catalogStatus = text("p", "text-xs text-muted empty:hidden", "");
  catalogStatus.setAttribute("role", "status");
  progsPanel.append(catalogHead, catalogStatus);
  const programList = text("ul", "space-y-2", "");
  let currentPrograms = (observation && observation.programs && typeof observation.programs === "object")
    ? { ...observation.programs }
    : {};
  let deleteBusy = false;

  async function deleteCreatedProgram(id, displayName) {
    if (typeof window.confirm === "function" && !window.confirm(`Delete program "${displayName}" from ${device.label}?`)) return;
    deleteBusy = true;
    renderProgramCatalog();
    catalogStatus.className = "text-xs text-muted";
    catalogStatus.textContent = "Delete request queued. Awaiting machine result.";
    try {
      const submitted = await submitMachine(device.source_id, "delete_program", { program_id: id });
      for (let attempt = 0; attempt < 20 && dialog.open; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const history = await fetch(`/api/dashboard/machines/${encodeURIComponent(device.source_id)}/commands?period=all&page=1`, { cache: "no-store" });
        if (!history.ok) continue;
        const record = (await history.json()).commands?.find(item => item.command_id === submitted.command_id);
        if (!record || ["queued", "published"].includes(record.status)) continue;
        if (record.status !== "succeeded") {
          catalogStatus.className = "text-xs text-warning";
          catalogStatus.textContent = `Delete ${record.status}${record.reason ? `: ${record.reason}` : "."}`;
          deleteBusy = false;
          renderProgramCatalog();
          return;
        }
        const response = await fetch("/api/dashboard/machines", { cache: "no-store" });
        if (!response.ok) continue;
        const updatedDevice = (await response.json()).devices?.find(item => item.source_id === device.source_id);
        const updatedCatalog = updatedDevice?.observation?.programs;
        if (updatedCatalog && typeof updatedCatalog === "object" && !(id in updatedCatalog)) {
          currentPrograms = { ...updatedCatalog };
          if (observation) observation.programs = currentPrograms;
          if (typeof editingProgramId !== "undefined" && editingProgramId === id) {
            livePane.classList.add("hidden");
          }
          deleteBusy = false;
          renderProgramCatalog();
          catalogStatus.className = "text-xs text-positive";
          catalogStatus.textContent = `Deleted "${displayName}" from machine.`;
          return;
        }
        catalogStatus.className = "text-xs text-muted";
        catalogStatus.textContent = "Machine applied delete. Waiting for updated catalog.";
      }
      catalogStatus.className = "text-xs text-warning";
      catalogStatus.textContent = "Result unknown. Check command history before trying again.";
    } catch (error) {
      catalogStatus.className = "text-xs text-negative";
      catalogStatus.textContent = error.message;
    } finally {
      deleteBusy = false;
      renderProgramCatalog();
    }
  }

  function renderProgramCatalog() {
    const programIds = Object.keys(currentPrograms).sort();
    addProgramButton.disabled = deleteBusy || !enabled || !isFresh || effectiveStatus !== "IDLE" || programIds.length >= 6;
    programList.replaceChildren();
    for (const id of programIds) {
      const saved = currentPrograms[id];
      const displayName = saved?.name || (id === "quick" ? "Quick" : id === "standard" ? "Standard" : id);
      const item = text("li", "rounded-md border border-rule bg-raised p-4 text-sm text-ink", "");
      const itemHead = text("div", "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", "");
      itemHead.append(text("h4", "text-base font-semibold text-ink", displayName));
      const actionRow = text("div", "flex flex-wrap items-center gap-2 shrink-0", "");
      const edit = text("button", "min-h-11 min-w-11 rounded-md border border-control bg-navy px-4 text-sm font-semibold text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:bg-raised disabled:text-muted", "Edit");
      edit.type = "button";
      edit.disabled = deleteBusy || !enabled || !isFresh || effectiveStatus !== "IDLE";
      edit.addEventListener("click", () => openProgramForm(id));
      actionRow.append(edit);
      if (/^p_[a-f0-9]{12}$/.test(id)) {
        const del = text(
          "button",
          "min-h-11 min-w-11 rounded-md border border-negative/40 bg-negative/10 px-4 text-sm font-semibold text-negative transition-colors enabled:hover:bg-negative enabled:hover:text-surface focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted",
          "Delete",
        );
        del.type = "button";
        del.setAttribute("aria-label", `Delete ${displayName}`);
        del.disabled = deleteBusy || !enabled || !isFresh || effectiveStatus !== "IDLE";
        del.addEventListener("click", () => deleteCreatedProgram(id, displayName));
        actionRow.append(del);
      }
      itemHead.append(actionRow);
      item.append(itemHead);
      if (saved) {
        const details = text("dl", "mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2", "");
        for (const [label, val] of [["Cycle rate", `RM ${saved.price_myr}`], ["Cycle time", `${saved.duration_seconds} seconds`]]) {
          const field = text("div", "", "");
          field.append(text("dt", "text-xs text-muted", label), text("dd", "text-sm tabular-nums text-ink", val));
          details.append(field);
        }
        item.append(details);
      }
      programList.append(item);
    }
  }
  renderProgramCatalog();
  progsPanel.append(programList);
  // --- TAB 4: Read-only vendor parameter reference ---
  const paramsPanel = text("div", "hidden space-y-5", "");
  tabPanels.parameters = paramsPanel;

  const paramSubBar = text("div", "flex flex-wrap gap-2 border-b border-rule pb-3", "");
  const paramSubPanes = {};
  const paramSubButtons = {};

  const livePane = text("div", "hidden rounded-md border border-line bg-surface p-4 space-y-4 md:p-5", "");
  const liveHead = text("div", "border-b border-rule pb-3", "");
  const editorTitle = text("h3", "text-base font-semibold text-ink", "Program editor");
  liveHead.append(editorTitle);
  livePane.append(liveHead);

  const requiredSettings = device.type === "dryer"
    ? ["program_id", "price_myr", "duration_seconds", "target_temperature_c"]
    : ["program_id", "price_myr", "duration_seconds", "target_temperature_c", "water_level", "spin_rpm"];
  const canEditSettings = enabled && isFresh && effectiveStatus === "IDLE" && requiredSettings.every(key => settings[key] != null);
  if (!canEditSettings) {
    const restrictNote = text("div", "rounded border border-warning/30 bg-warning/10 p-3 text-xs text-ink", "");
    restrictNote.append(
      text("p", "font-semibold text-warning", "Modifications Restricted"),
      text("p", "mt-0.5 text-muted", "Programs can be changed only while the machine is connected and idle."),
    );
    livePane.append(restrictNote);
  }

  const formStatus = text("p", "text-xs text-muted", "");
  formStatus.setAttribute("role", "status");

  const form = text("form", "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", "");
  const fields = [
    ["name", "Program name", "text"],
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
      input.type = kind === "text" ? "text" : "number";
      input.required = true;
      if (kind === "text") { input.maxLength = 18; input.pattern = "[A-Za-z0-9][A-Za-z0-9 -]{0,17}"; }
      else input.step = key === "price_myr" ? "0.01" : "1";
    }
    input.value = settings[key] ?? "";
    box.append(input);
    form.append(box);
  }

  const saveRow = text("div", "flex flex-col gap-2 border-t border-rule pt-4 sm:col-span-2 sm:flex-row sm:justify-end lg:col-span-3", "");
  const cancelEdit = text("button", "min-h-11 min-w-11 rounded-md border border-control bg-navy px-5 text-sm text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent", "Cancel");
  cancelEdit.type = "button";
  cancelEdit.addEventListener("click", () => livePane.classList.add("hidden"));
  const saveBtn = text(
    "button",
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-5 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted",
    "Save program",
  );
  saveBtn.type = "submit";
  saveBtn.disabled = !canEditSettings;
  saveRow.append(cancelEdit, saveBtn);
  form.append(saveRow);

  let editingProgramId = null;
  let creatingProgram = false;
  function openProgramForm(id) {
    creatingProgram = !id;
    editingProgramId = id || `p_${Math.floor(Math.random() * 2 ** 48).toString(16).padStart(12, "0")}`;
    const selected = id ? currentPrograms[id] : null;
    editorTitle.textContent = id ? `Edit ${selected?.name || id}` : "Add program";
    for (const key of requiredSettings) {
      if (key !== "program_id" && form.elements[key]) form.elements[key].value = selected?.[key] ?? settings[key] ?? "";
    }
    form.elements.name.value = selected?.name || (id === "quick" ? "Quick" : id === "standard" ? "Standard" : "");
    formStatus.textContent = "";
    livePane.classList.remove("hidden");
    form.elements.name.focus();
  }
  addProgramButton.addEventListener("click", () => openProgramForm(null));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (typeof window.confirm === "function" && !window.confirm(`Save program on ${device.label}?`)) return;
    const data = new FormData(form);
    const args = {
      program_id: editingProgramId,
      ...(creatingProgram ? { create: true } : {}),
      name: String(data.get("name") || "").trim(),
      price_myr: data.get("price_myr"),
      duration_seconds: Number(data.get("duration_seconds")),
      target_temperature_c: Number(data.get("target_temperature_c")),
      water_level: device.type === "dryer" ? null : data.get("water_level"),
      spin_rpm: device.type === "dryer" ? null : Number(data.get("spin_rpm")),
    };
    try {
      saveBtn.disabled = true;
      const submitted = await submitMachine(device.source_id, "set_settings", args);
      formStatus.textContent = "Program request queued. Awaiting machine result.";
      for (let attempt = 0; attempt < 20 && dialog.open; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const history = await fetch(`/api/dashboard/machines/${encodeURIComponent(device.source_id)}/commands?period=all&page=1`, { cache: "no-store" });
        if (!history.ok) continue;
        const record = (await history.json()).commands?.find(item => item.command_id === submitted.command_id);
        if (!record || ["queued", "published"].includes(record.status)) continue;
        if (record.status !== "succeeded") {
          formStatus.textContent = `Program ${record.status}${record.reason ? `: ${record.reason}` : "."}`;
          saveBtn.disabled = record.status === "unknown";
          return;
        }
        const response = await fetch("/api/dashboard/machines", { cache: "no-store" });
        if (!response.ok) continue;
        const updatedDevice = (await response.json()).devices?.find(item => item.source_id === device.source_id);
        const updatedCatalog = updatedDevice?.observation?.programs;
        const updated = updatedCatalog?.[args.program_id];
        if (updated && updated.name === args.name && String(updated.price_myr) === String(Number(args.price_myr).toFixed(2)) && updated.duration_seconds === args.duration_seconds) {
          currentPrograms = { ...updatedCatalog };
          if (observation) observation.programs = currentPrograms;
          renderProgramCatalog();
          saveBtn.disabled = false;
          livePane.classList.add("hidden");
          catalogStatus.className = "text-xs text-positive";
          catalogStatus.textContent = `Saved "${updated.name}" on machine.`;
          return;
        }
        formStatus.textContent = "Machine applied the command. Waiting for updated state.";
      }
      formStatus.textContent = "Result unknown. Check command history before trying again.";
    } catch (error) {
      formStatus.textContent = error.message;
      saveBtn.disabled = false;
    }
  });

  livePane.append(form, formStatus);
  progsPanel.append(livePane);

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
      gKey === "machine"
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
  paramSubPanes.machine?.classList.remove("hidden");

  paramsPanel.append(paramSubBar);
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

// --- Full-Width Machine Row & Stacked Card (Matched Layout & Typography with safetyCard) ---
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

  // Tier 1: Machine Identity (Device ID only) & Status Badge Row (matching safetyCard Tier 1)
  const tier1 = text("div", "flex min-w-0 items-center gap-3.5", "");
  const vesselWrap = text("div", "flex size-16 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/40 p-1.5", "");
  vesselWrap.append(isWasher ? createWasherSvg(effectiveStatus, "size-12 shrink-0") : createDryerSvg(effectiveStatus, "size-12 shrink-0"));

  const idRow = text("div", "flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4", "");
  const titleMeta = text("div", "min-w-0", "");
  titleMeta.append(text("h2", "min-w-0 break-words text-base font-semibold leading-normal text-ink", device.label));
  const identity = text("dl", "mt-2 grid grid-cols-1 gap-y-1 text-xs", "");
  const deviceIdField = text("div", "min-w-0", "");
  deviceIdField.append(
    text("dt", "text-faint", "Device ID"),
    text("dd", "mt-0.5 break-all text-muted", device.source_id),
  );
  identity.append(deviceIdField);
  titleMeta.append(identity);

  const badgeWrap = text("div", "flex max-w-full flex-wrap items-center gap-2 shrink-0", "");
  const statusPill = text("span", `inline-flex max-w-full shrink-0 items-center gap-2 whitespace-normal break-words rounded border px-2.5 py-1 text-xs font-medium ${badge.wrapper}`, "");
  statusPill.append(text("span", `size-2 shrink-0 rounded-full ${badge.dot}`, ""), text("span", "", badge.label));
  badgeWrap.append(statusPill);

  idRow.append(titleMeta, badgeWrap);
  tier1.append(vesselWrap, idRow);
  card.append(tier1);

  // Tier 2: Horizontal 3-Box Detail Grid (row-stacked pairs, matching safetyCard font sizing)
  const tier2 = text("div", "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", "");

  const makeRowBox = (rows) => {
    const box = text("dl", "flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4", "");
    rows.forEach(([label, valText], idx) => {
      const item = text("div", idx > 0 ? "min-w-0 border-t border-rule/60 pt-2.5" : "min-w-0", "");
      item.append(
        text("dt", "text-xs leading-normal text-muted truncate", label),
        text("dd", "mt-1 min-w-0 break-words text-sm font-semibold leading-normal tabular-nums text-ink", valText),
      );
      box.append(item);
    });
    return box;
  };

  const machineStateText = effectiveStatus === "RUNNING"
    ? "Running"
    : effectiveStatus === "PAUSED"
      ? "Paused"
      : effectiveStatus === "IDLE"
        ? "Idle"
        : effectiveStatus === "ERROR"
          ? (observation?.fault_code ? `Fault (${observation.fault_code})` : "Fault")
          : "Offline";
  const remEstimateVal = isFresh && remainingSecs !== null ? `${remainingSecs} s (${remainingMins} min)` : "—";

  const cycleBox = makeRowBox([
    ["Machine state", machineStateText],
    ["Remaining estimate", remEstimateVal],
  ]);

  const specsBox = makeRowBox([
    ["Capacity", device.capacity_kg == null ? "Unavailable" : `${number(device.capacity_kg, 1)} kg`],
    ["Category", device.type === "washer_dryer" ? "Washer / Dryer" : isWasher ? "Washer" : "Dryer"],
  ]);

  const telemetryBox = makeRowBox([
    ["Last sample", lastUpdate(observation)],
    ["Freshness", freshnessText(observation)],
  ]);

  tier2.append(cycleBox, specsBox, telemetryBox);
  card.append(tier2);

  // Tier 3: Action Controls & Modal Trigger Footer
  const tier3 = text("div", "flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between", "");
  const canStart = enabled && isFresh && (effectiveStatus === "IDLE" || effectiveStatus === "PAUSED");
  const canPause = enabled && isFresh && effectiveStatus === "RUNNING";
  const canStop = enabled && isFresh && (effectiveStatus === "RUNNING" || effectiveStatus === "PAUSED");

  const actionError = text("p", "hidden rounded-md border-l-2 border-negative bg-raised px-4 py-3 text-xs text-ink", "");
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
      "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-xs font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted",
    ),
    makeRowActionBtn(
      "Pause",
      iconPause("size-3.5 shrink-0"),
      "pause",
      canPause,
      "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted",
    ),
    makeRowActionBtn(
      "Stop",
      iconSquare("size-3.5 shrink-0"),
      "stop",
      canStop,
      "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-negative bg-negative px-3.5 py-2 text-xs font-semibold text-surface transition-colors duration-150 enabled:hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted",
    ),
  );

  if (effectiveStatus === "IDLE" || effectiveStatus === "ERROR") {
    const unlockBtn = text(
      "button",
      "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      "",
    );
    unlockBtn.type = "button";
    unlockBtn.append(iconUnlock("size-3.5 shrink-0"), text("span", "", "Unlock door"));
    unlockBtn.addEventListener("click", () => openModal("diagnostics"));
    controlsGroup.append(unlockBtn);
  }

  const secondaryGroup = text("div", "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", "");
  const detailsBtn = text(
    "button",
    "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink transition-colors duration-150 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto",
    "",
  );
  detailsBtn.type = "button";
  detailsBtn.id = triggerId;
  detailsBtn.append(iconSliders("size-4 shrink-0 text-muted"), text("span", "", "Details & parameters"));
  detailsBtn.addEventListener("click", () => openModal("diagnostics"));
  secondaryGroup.append(detailsBtn);

  if (enabled && device.source_id === "washer-sim-01") {
    const checkoutLink = text(
      "a",
      "inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink transition-colors duration-150 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto",
      "Create demo QR",
    );
    checkoutLink.href = "/demo/new?source_id=washer-sim-01";
    secondaryGroup.append(checkoutLink);
  }

  tier3.append(controlsGroup, secondaryGroup);
  card.append(tier3, actionError, dialog);
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

  const isMaintenance = Boolean(device.maintenance_mode || device.status === "maintenance");
  const gasInfo = device.gas_interpretation || {};
  const maintSession = device.maintenance_session || null;
  const estPpm = fresh ? value(observation, "estimated_ppm") : null;
  const validEstPpm = typeof estPpm === "number" && Number.isFinite(estPpm);
  const card = text(
    "article",
    "flex min-w-0 w-full flex-col gap-4 rounded-md border border-line bg-surface p-4 sm:p-5 md:p-6",
    "",
  );
  card.setAttribute("aria-label", `${device.label} (${freshnessText(observation)})`);

  // Tier 1: Node Identity (Device ID only) & Freshness / Cloud Delivery Column
  const tier1 = text("div", "flex min-w-0 items-center gap-3.5", "");
  const vesselWrap = text("div", "flex size-16 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/40 p-1.5", "");
  vesselWrap.append(createCylinderSvg(validPercent ? percent : null, "UNKNOWN", isMaintenance, "size-14"));

  const idRow = text("div", "flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4", "");
  const titleMeta = text("div", "min-w-0", "");
  titleMeta.append(text("h2", "min-w-0 truncate text-base font-semibold leading-normal text-ink", device.label));
  const identity = text("dl", "mt-2 grid grid-cols-1 gap-y-1 text-xs", "");
  const deviceIdField = text("div", "min-w-0", "");
  deviceIdField.append(
    text("dt", "text-faint", "Device ID"),
    text("dd", "mt-0.5 break-all text-muted", device.source_id),
  );
  identity.append(deviceIdField);
  titleMeta.append(identity);

  const headerStatusCol = text("div", "flex flex-col items-end gap-1.5 shrink-0", "");
  const badgeWrap = text("div", "flex flex-wrap items-center justify-end gap-2", "");
  if (isMaintenance) {
    const maintPill = text("span", "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning", "");
    maintPill.append(iconWrench("size-3.5 shrink-0"), text("span", "", "Maintenance"));
    badgeWrap.append(maintPill);
  }
  const freshPill = text("span", `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded border px-2.5 py-1 text-xs font-medium ${freshnessBadgeClass}`, "");
  freshPill.append(text("span", `size-2 rounded-full ${freshnessDotClass}`, ""), text("span", "", freshnessText(observation)));
  badgeWrap.append(freshPill);

  const cloudStateText = observation?.sync_state
    ? `Cloud delivery ${observation.sync_state}`
    : "Cloud delivery unknown";
  const cloudDeliveryLine = text("p", "text-right text-xs leading-normal text-muted", cloudStateText);
  headerStatusCol.append(badgeWrap, cloudDeliveryLine);

  idRow.append(titleMeta, headerStatusCol);
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

  // Box 1: Fuel Mass & Reported Level (or Tank-Swap Paused State)
  const fuelBox = text("div", "flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4", "");
  if (isMaintenance) {
    const pausedTop = text("dl", "flex flex-wrap items-baseline justify-between gap-2", "");
    pausedTop.append(
      text("dt", "text-xs leading-normal text-muted", "Fuel level"),
      text("dd", "text-sm font-semibold leading-normal text-warning", "Paused (Tank swap)"),
    );
    fuelBox.append(pausedTop);
    const pausedGrid = text("dl", "grid grid-cols-2 gap-3 border-t border-rule/60 pt-2.5", "");
    const startedByCol = text("div", "min-w-0", "");
    startedByCol.append(
      text("dt", "text-xs leading-normal text-muted truncate", "Started by"),
      text("dd", "mt-1 text-sm font-semibold leading-normal text-ink truncate", maintSession?.started_by || "Local staff"),
    );
    pausedGrid.append(
      makeMetricPair("Live scale", "gross_weight_kg", " kg", 2),
      startedByCol,
    );
    fuelBox.append(pausedGrid);
  } else {
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
  }

  // Box 2: Gas Status (top) & Estimated LPG PPM (bottom), no section header
  let ppmText = "Baseline needed";
  let ppmValueClass = "text-warning";
  let gasStatusText = "Uncalibrated";
  let gasStatusClass = "text-muted";

  if (gasInfo.ppm_calibrated) {
    if (fresh && validEstPpm) {
      ppmText = `${number(estPpm, estPpm < 100 ? 1 : 0)} ppm`;
      ppmValueClass = gasInfo.gas_condition === "critical"
        ? "text-negative"
        : gasInfo.gas_condition === "warning"
          ? "text-warning"
          : "text-ink";

      if (gasInfo.gas_condition === "critical") {
        gasStatusText = "Critical";
        gasStatusClass = "text-negative";
      } else if (gasInfo.gas_condition === "warning") {
        gasStatusText = "Elevated";
        gasStatusClass = "text-warning";
      } else if (gasInfo.gas_condition === "normal") {
        gasStatusText = "Normal";
        gasStatusClass = "text-positive";
      } else if (gasInfo.gas_condition === "out_of_range") {
        gasStatusText = "Out of range";
        gasStatusClass = "text-warning";
      } else {
        gasStatusText = "Unavailable";
      }
    } else {
      ppmText = "—";
      ppmValueClass = "text-muted";
      gasStatusText = fresh && gasInfo.gas_condition === "out_of_range" ? "Out of range" : "—";
      if (fresh && gasInfo.gas_condition === "out_of_range") {
        gasStatusClass = "text-warning";
      }
    }
  }

  const makeRowBox = rows => {
    const box = text("dl", "flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4", "");
    rows.forEach(([label, valText, valColorClass = "text-ink"], idx) => {
      const item = text("div", idx > 0 ? "min-w-0 border-t border-rule/60 pt-2.5" : "min-w-0", "");
      item.append(
        text("dt", "text-xs leading-normal text-muted truncate", label),
        text("dd", `mt-1 min-w-0 break-words text-sm font-semibold leading-normal tabular-nums ${valColorClass}`, valText),
      );
      box.append(item);
    });
    return box;
  };

  const gasBox = makeRowBox([
    ["Gas status", gasStatusText, gasStatusClass],
    ["Est. LPG", ppmText, ppmValueClass],
  ]);

  // Box 3: Temperature (top) & Humidity (bottom), no section header
  const tempVal = reading("temperature");
  const humVal = reading("humidity");
  const envBox = makeRowBox([
    ["Temperature", number(tempVal, 1) + (tempVal === null ? "" : " °C")],
    ["Humidity", number(humVal, 1) + (humVal === null ? "" : "%")],
  ]);

  tier2.append(fuelBox, gasBox, envBox);
  card.append(tier2);

  // Tier 3: Last Sample Provenance + Mobile-first Maintenance & Gas Baseline Controls
  const tier3Wrap = text("div", "flex flex-col gap-3 border-t border-rule pt-3 lg:flex-row lg:items-center lg:justify-between", "");
  const tier3Meta = text("dl", "grid grid-cols-1 gap-y-1 text-xs", "");
  const lastSampleField = text("div", "min-w-0", "");
  lastSampleField.append(text("dt", "text-faint", "Last sample"), text("dd", "mt-0.5 text-muted", lastUpdate(observation)));
  tier3Meta.append(lastSampleField);

  const actionRow = text("div", "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center shrink-0", "");
  const baselineBtn = text(
    "button",
    "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-raised/60 px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
    gasInfo.ppm_calibrated ? "Recalibrate gas" : "Calibrate clean air",
  );
  baselineBtn.type = "button";
  baselineBtn.addEventListener("click", () => openGasBaselineModal(device));

  const maintBtn = text(
    "button",
    isMaintenance
      ? "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-positive/40 bg-positive/15 px-3.5 py-2 text-xs font-semibold text-positive transition-colors hover:bg-positive/25 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto"
      : "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-warning/40 bg-warning/15 px-3.5 py-2 text-xs font-semibold text-warning transition-colors hover:bg-warning/25 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto",
    "",
  );
  maintBtn.type = "button";
  maintBtn.append(iconWrench("size-3.5 shrink-0"), text("span", "", isMaintenance ? "Complete tank swap" : "Start tank swap"));
  maintBtn.addEventListener("click", () => {
    if (isMaintenance) openCompleteMaintenanceModal(device);
    else openStartMaintenanceModal(device);
  });

  actionRow.append(baselineBtn, maintBtn);
  tier3Wrap.append(tier3Meta, actionRow);
  card.append(tier3Wrap);

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
// --- Notifications: Live Popups, Header Dropdown & Full History Modal ---
let notificationScope = "local";
let mergedNotifications = [];
let notificationModalFilter = "all";
let activeNotificationsDialog = null;
let renderActiveNotificationsModal = null;

const getWebStorage = kind => {
  try {
    return typeof window !== "undefined" ? window[kind] : null;
  } catch {
    return null;
  }
};

const readStorageJson = (kind, key, fallback) => {
  const store = getWebStorage(kind);
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeStorageJson = (kind, key, val) => {
  const store = getWebStorage(kind);
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(val));
  } catch {
    // Ignore storage quota / private mode failures
  }
};

const notificationStorageKeys = scope => ({
  feed: `spinsense.pi.notifications.feed.${scope}`,
  lastRead: `spinsense.pi.notifications.lastRead.${scope}`,
  prevState: `spinsense.pi.notifications.prevState.${scope}`,
});

const lpgFillBand = pct => {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  if (pct < 5) return "critical";
  if (pct < 15) return "low";
  return "normal";
};

const formatNotificationProgram = prog => {
  if (typeof prog !== "string" || !prog.trim()) return null;
  const norm = prog.trim().toLowerCase();
  if (norm === "quick") return "Quick";
  if (norm === "standard") return "Standard";
  return norm.replaceAll("_", " ").replace(/\b\w/g, ch => ch.toUpperCase());
};

function notificationVisuals(item) {
  const severity = item.severity || "neutral";
  const badgeClass = severity === "negative"
    ? "border-negative/30 bg-negative/10 text-negative"
    : severity === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : severity === "positive"
        ? "border-positive/30 bg-positive/10 text-positive"
        : severity === "info"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-line bg-raised text-muted";
  const borderClass = severity === "negative"
    ? "border-negative/50"
    : severity === "warning"
      ? "border-warning/50"
      : severity === "info"
        ? "border-accent/50"
        : "border-line";

  let icon = iconBell("size-4 shrink-0 text-muted");
  if (item.kind === "machine_running") icon = iconPlay("size-4 shrink-0 text-accent");
  else if (item.kind === "machine_fault") icon = iconAlertTriangle("size-4 shrink-0 text-negative");
  else if (item.kind === "machine_completed") icon = iconCheckCircle("size-4 shrink-0 text-positive");
  else if (item.kind === "lpg_maintenance") icon = iconWrench("size-4 shrink-0 text-warning");
  else if (item.kind === "lpg_critical" || item.kind === "lpg_gas_critical") icon = iconFlame("size-4 shrink-0 text-negative");
  else if (item.kind === "lpg_low" || item.kind === "lpg_gas_warning") icon = iconFlame("size-4 shrink-0 text-warning");

  const kindLabel = item.kind === "machine_running" ? "Running"
    : item.kind === "machine_fault" ? "Fault"
      : item.kind === "machine_completed" ? "Completed"
        : item.kind === "machine_stopped" ? "Stopped"
          : item.kind === "lpg_maintenance" ? "Maintenance"
            : item.kind === "lpg_gas_critical" ? "Gas Leak"
              : item.kind === "lpg_gas_warning" ? "Elevated Gas"
                : item.kind === "lpg_critical" ? "Critical Low"
                  : item.kind === "lpg_low" ? "Low LPG"
                    : "Activity";

  return { badgeClass, borderClass, icon, kindLabel };
}

function detectNotificationTransitions(prevMap, devices, checkedAt) {
  const nextMap = {};
  const triggeredEvents = [];
  const seeded = prevMap !== null && typeof prevMap === "object";

  for (const dev of devices || []) {
    if (!dev || !dev.source_id) continue;
    const prev = seeded ? prevMap[dev.source_id] : null;
    const isMachine = dev.type === "washer" || dev.type === "dryer" || dev.type === "washer_dryer";
    const isLpg = dev.type === "lpg_edge_node";
    const currBand = isLpg && !dev.maintenance_mode ? lpgFillBand(dev.lpg_percent) : null;
    const currGasCond = (isLpg && dev.ppm_calibrated && dev.freshness === "fresh")
      ? (dev.gas_condition || null)
      : null;
    const occurredAt = dev.sample_at || checkedAt || new Date().toISOString();

    nextMap[dev.source_id] = {
      state: dev.state || "UNKNOWN",
      fault_code: dev.fault_code || null,
      lpg_band: currBand,
      gas_condition: currGasCond,
      maintenance_mode: Boolean(dev.maintenance_mode),
    };

    if (!seeded) continue;

    if (isMachine) {
      if (dev.state === "RUNNING" && prev?.state !== "RUNNING") {
        const prog = formatNotificationProgram(dev.program_id);
        triggeredEvents.push({
          id: `tx:machine:${dev.source_id}:running:${occurredAt}`,
          category: "machine",
          kind: "machine_running",
          severity: "info",
          title: "Machine running",
          detail: `${dev.label || dev.source_id} started ${prog || "cycle"}`,
          source_id: dev.source_id,
          device_label: dev.label || dev.source_id,
          occurred_at: occurredAt,
          active: true,
        });
      }
      if (dev.state === "ERROR" && (prev?.state !== "ERROR" || (dev.fault_code && dev.fault_code !== prev?.fault_code))) {
        triggeredEvents.push({
          id: `tx:machine:${dev.source_id}:error:${occurredAt}`,
          category: "machine",
          kind: "machine_fault",
          severity: "negative",
          title: "Machine fault",
          detail: dev.fault_code
            ? `${dev.label || dev.source_id} reported fault ${dev.fault_code}`
            : `${dev.label || dev.source_id} broke down`,
          source_id: dev.source_id,
          device_label: dev.label || dev.source_id,
          occurred_at: occurredAt,
          active: true,
        });
      }
    } else if (isLpg) {
      if (dev.maintenance_mode && !prev?.maintenance_mode) {
        triggeredEvents.push({
          id: `tx:lpg:${dev.source_id}:maintenance:${occurredAt}`,
          category: "lpg",
          kind: "lpg_maintenance",
          severity: "warning",
          title: "LPG undergoing maintenance",
          detail: `${dev.label || dev.source_id} is undergoing maintenance`,
          source_id: dev.source_id,
          device_label: dev.label || dev.source_id,
          occurred_at: occurredAt,
          active: true,
        });
      }
      if (!dev.maintenance_mode) {
        if (currBand === "critical" && prev?.lpg_band !== "critical") {
          triggeredEvents.push({
            id: `tx:lpg:${dev.source_id}:critical:${occurredAt}`,
            category: "lpg",
            kind: "lpg_critical",
            severity: "negative",
            title: "LPG gas critically low",
            detail: `${dev.label || dev.source_id} at ${Number(dev.lpg_percent).toFixed(1)}% remaining`,
            source_id: dev.source_id,
            device_label: dev.label || dev.source_id,
            occurred_at: occurredAt,
            active: true,
          });
        } else if (currBand === "low" && prev?.lpg_band !== "low" && prev?.lpg_band !== "critical") {
          triggeredEvents.push({
            id: `tx:lpg:${dev.source_id}:low:${occurredAt}`,
            category: "lpg",
            kind: "lpg_low",
            severity: "warning",
            title: "LPG gas level low",
            detail: `${dev.label || dev.source_id} at ${Number(dev.lpg_percent).toFixed(1)}% remaining`,
            source_id: dev.source_id,
            device_label: dev.label || dev.source_id,
            occurred_at: occurredAt,
            active: true,
          });
        }
      }
      if (currGasCond === "critical" || currGasCond === "warning") {
        const hasPpm = dev.estimated_ppm !== null && dev.estimated_ppm !== undefined && Number.isFinite(Number(dev.estimated_ppm));
        const devLabel = dev.label || dev.source_id;
        if (currGasCond === "critical" && prev?.gas_condition !== "critical") {
          triggeredEvents.push({
            id: `tx:lpg:${dev.source_id}:gas_critical:${occurredAt}`,
            category: "lpg",
            kind: "lpg_gas_critical",
            severity: "negative",
            title: "LPG gas leak critical",
            detail: hasPpm
              ? `${devLabel} estimated ${Math.round(Number(dev.estimated_ppm))} ppm (MQ-6)`
              : `${devLabel} detected dangerous LPG gas levels`,
            source_id: dev.source_id,
            device_label: devLabel,
            occurred_at: occurredAt,
            active: true,
          });
        } else if (currGasCond === "warning" && prev?.gas_condition !== "warning" && prev?.gas_condition !== "critical") {
          triggeredEvents.push({
            id: `tx:lpg:${dev.source_id}:gas_warning:${occurredAt}`,
            category: "lpg",
            kind: "lpg_gas_warning",
            severity: "warning",
            title: "LPG gas elevated",
            detail: hasPpm
              ? `${devLabel} estimated ${Math.round(Number(dev.estimated_ppm))} ppm (MQ-6)`
              : `${devLabel} detected elevated LPG gas levels`,
            source_id: dev.source_id,
            device_label: devLabel,
            occurred_at: occurredAt,
            active: true,
          });
        }
      }
    }
  }

  return { nextMap, triggeredEvents };
}

function mergeNotificationEvents(serverEvents, localEvents) {
  const txList = (localEvents || []).filter(item => item && typeof item.id === "string" && item.id.startsWith("tx:"));
  const byId = new Map();

  for (const item of serverEvents || []) {
    if (!item || !item.id) continue;
    if (item.id.startsWith("live:")) {
      const liveMs = Date.parse(item.occurred_at || "");
      const coveredByRecentTx = txList.some(tx => {
        if (tx.source_id !== item.source_id || tx.kind !== item.kind) return false;
        const txMs = Date.parse(tx.occurred_at || "");
        return Number.isFinite(liveMs) && Number.isFinite(txMs) ? Math.abs(liveMs - txMs) <= 180000 : true;
      });
      if (coveredByRecentTx) continue;
    }
    byId.set(item.id, item);
  }

  for (const item of localEvents || []) {
    if (!item || !item.id || byId.has(item.id)) continue;
    byId.set(item.id, item);
  }

  return [...byId.values()]
    .sort((a, b) => String(b.occurred_at || "").localeCompare(String(a.occurred_at || "")))
    .slice(0, 200);
}

function pushToastNotification(item) {
  const region = byId("toastRegion");
  if (!region) return;
  while (region.children.length >= 3) {
    const removable = [...region.children].find(node => node.dataset.sticky !== "true") || region.firstElementChild;
    removable?.remove();
  }

  const visuals = notificationVisuals(item);
  const isSticky = item.severity === "negative";
  const toast = text(
    "div",
    `pointer-events-auto flex w-full items-start gap-3 rounded-md border ${visuals.borderClass} bg-surface p-3.5 text-ink shadow-xl`,
    "",
  );
  toast.setAttribute("role", isSticky ? "alert" : "status");
  if (isSticky) toast.dataset.sticky = "true";

  const iconWrap = text("div", "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/60", "");
  iconWrap.append(visuals.icon);

  const body = text("div", "min-w-0 flex-1", "");
  const headerRow = text("div", "flex items-center justify-between gap-2", "");
  headerRow.append(
    text("p", "truncate text-xs font-semibold text-ink", item.title || "Notification"),
    text("span", `shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${visuals.badgeClass}`, visuals.kindLabel),
  );
  body.append(
    headerRow,
    text("p", "mt-0.5 break-words text-xs text-muted", item.detail || item.device_label || item.source_id || ""),
    text("p", "mt-1 text-[11px] tabular-nums text-faint", dateLabel(item.occurred_at)),
  );

  const closeBtn = text(
    "button",
    "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
    "",
  );
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.append(iconX("size-4"), text("span", "sr-only", "Dismiss"));

  let timerId = null;
  const dismiss = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    toast.remove();
  };
  closeBtn.addEventListener("click", dismiss);

  toast.append(iconWrap, body, closeBtn);
  region.append(toast);

  if (!isSticky) {
    const duration = item.severity === "warning" ? 8000 : 6000;
    timerId = setTimeout(dismiss, duration);
  }
}

function buildNotificationListItem(item, compact = false) {
  const visuals = notificationVisuals(item);
  const li = text("li", compact ? "px-4 py-3 transition-colors hover:bg-raised/40" : "px-4 py-3.5 sm:px-5 transition-colors hover:bg-raised/30", "");
  const row = text("div", "flex items-start gap-3", "");
  const iconWrap = text("div", "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/60", "");
  iconWrap.append(visuals.icon);

  const content = text("div", "min-w-0 flex-1", "");
  const topLine = text("div", "flex flex-wrap items-center justify-between gap-2", "");
  const leftMeta = text("div", "flex min-w-0 flex-wrap items-center gap-2", "");
  leftMeta.append(
    text("span", "truncate text-xs font-semibold text-ink", item.title || "Notification"),
    text("span", `rounded border px-1.5 py-0.5 text-[11px] font-medium ${visuals.badgeClass}`, visuals.kindLabel),
  );
  if (!compact) {
    const categoryLabel = item.category === "lpg" ? "LPG & Safety" : "Machine";
    leftMeta.append(text("span", "rounded border border-rule bg-raised/40 px-1.5 py-0.5 text-[11px] text-muted", categoryLabel));
  }
  topLine.append(
    leftMeta,
    text("span", "shrink-0 text-[11px] tabular-nums text-faint", dateLabel(item.occurred_at)),
  );
  content.append(
    topLine,
    text("p", "mt-1 break-words text-xs text-muted", item.detail || item.device_label || item.source_id || ""),
  );
  if (!compact && item.source_id) {
    content.append(text("p", "mt-1 text-[11px] tabular-nums text-faint", `Device: ${item.device_label || item.source_id} (${item.source_id})`));
  }
  row.append(iconWrap, content);
  li.append(row);
  return li;
}

function renderNotificationControls() {
  const badge = byId("notificationsBadge");
  const list = byId("notificationsDropdownList");
  const keys = notificationStorageKeys(notificationScope);
  const lastReadAt = readStorageJson("localStorage", keys.lastRead, "");

  if (badge) {
    const unread = mergedNotifications.filter(item => !lastReadAt || (item.occurred_at && String(item.occurred_at) > String(lastReadAt)));
    const hasCriticalUnread = unread.some(item => item.severity === "negative");
    if (unread.length > 0) {
      badge.textContent = unread.length > 99 ? "99+" : String(unread.length);
      badge.className = `absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums ${
        hasCriticalUnread ? "bg-negative text-ink" : "bg-accent text-surface"
      }`;
    } else {
      badge.className = "hidden";
      badge.textContent = "0";
    }
  }

  if (list) {
    list.replaceChildren();
    const preview = mergedNotifications.slice(0, 5);
    if (!preview.length) {
      list.append(text("li", "px-4 py-6 text-center text-xs text-muted", "No notifications recorded."));
    } else {
      for (const item of preview) {
        list.append(buildNotificationListItem(item, true));
      }
    }
  }

  if (activeNotificationsDialog && renderActiveNotificationsModal) {
    renderActiveNotificationsModal();
  }
}

function setNotificationsDropdownOpen(open) {
  const btn = byId("notificationsButton");
  const dropdown = byId("notificationsDropdown");
  if (!btn || !dropdown) return;
  dropdown.classList.toggle("hidden", !open);
  dropdown.classList.toggle("flex", open);
  btn.setAttribute("aria-expanded", String(open));
}

function markNotificationsRead() {
  const keys = notificationStorageKeys(notificationScope);
  const newest = mergedNotifications.find(item => item.occurred_at)?.occurred_at || new Date().toISOString();
  writeStorageJson("localStorage", keys.lastRead, newest);
  renderNotificationControls();
}

const NOTIFICATIONS_PAGE_SIZE = 10;

function openNotificationsModal() {
  if (activeNotificationsDialog) {
    activeNotificationsDialog.close();
    activeNotificationsDialog.remove();
  }
  setNotificationsDropdownOpen(false);
  markNotificationsRead();

  const dialog = text(
    "dialog",
    "fixed inset-0 z-50 m-auto hidden h-11/12 w-11/12 max-w-none flex-col overflow-hidden rounded-md border border-control bg-surface p-0 text-ink shadow-2xl backdrop:bg-canvas/80 open:flex",
    "",
  );
  dialog.setAttribute("aria-labelledby", "allNotificationsTitle");

  const header = text("div", "flex items-center justify-between gap-3 border-b border-rule px-4 py-3.5 sm:px-5", "");
  const headerLeft = text("div", "flex min-w-0 items-center gap-2.5", "");
  const iconBox = text("div", "flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-raised/60", "");
  iconBox.append(iconBell("size-5 text-accent"));
  const title = text("h2", "truncate text-base font-semibold text-ink sm:text-lg", "Notifications");
  title.id = "allNotificationsTitle";
  headerLeft.append(iconBox, title);

  const closeBtn = text(
    "button",
    "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-raised/40 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent",
    "",
  );
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close notifications modal");
  closeBtn.append(iconX("size-5"), text("span", "sr-only", "Close"));
  closeBtn.addEventListener("click", () => dialog.close());
  header.append(headerLeft, closeBtn);
  dialog.append(header);

  const filterBar = text("div", "flex flex-wrap gap-2 border-b border-rule bg-raised/20 px-4 py-3 sm:px-5", "");
  filterBar.setAttribute("role", "group");
  filterBar.setAttribute("aria-label", "Filter notification history");

  const listWrap = text("div", "min-h-0 flex-1 overflow-y-auto", "");
  const modalList = text("ul", "divide-y divide-rule", "");
  listWrap.append(modalList);

  const pagerWrap = text(
    "div",
    "hidden flex-col gap-2 border-t border-rule bg-raised/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5",
    "",
  );
  pagerWrap.id = "notificationsModalPager";
  const pageLabel = text("p", "text-xs sm:text-sm text-muted tabular-nums", "Page 1 of 1");
  const pagerButtons = text("div", "flex gap-2", "");
  const pagerBtnClass = "inline-flex min-h-11 min-w-11 flex-1 sm:flex-initial items-center justify-center rounded-md border border-control bg-navy px-4 text-sm font-medium text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted";
  const previousBtn = text("button", pagerBtnClass, "Previous");
  const nextBtn = text("button", pagerBtnClass, "Next");
  previousBtn.type = "button";
  nextBtn.type = "button";
  pagerButtons.append(previousBtn, nextBtn);
  pagerWrap.append(pageLabel, pagerButtons);

  dialog.append(filterBar, listWrap, pagerWrap);

  let modalPage = 1;
  const filterBtns = {};
  const filters = [
    ["all", "All"],
    ["machine", "Machines"],
    ["lpg", "LPG & Safety"],
  ];

  const renderModalContent = () => {
    const filtered = notificationModalFilter === "all"
      ? mergedNotifications
      : mergedNotifications.filter(item => item.category === notificationModalFilter);

    for (const [key, label] of filters) {
      const btn = filterBtns[key];
      if (!btn) continue;
      const active = notificationModalFilter === key;
      const count = key === "all"
        ? mergedNotifications.length
        : mergedNotifications.filter(item => item.category === key).length;
      btn.textContent = `${label} (${count})`;
      btn.setAttribute("aria-pressed", String(active));
      btn.className = active
        ? "inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-navy-selected px-3.5 py-2 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-accent"
        : "inline-flex min-h-11 items-center justify-center rounded-md border border-line bg-raised/40 px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:border-control hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
    }

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / NOTIFICATIONS_PAGE_SIZE));
    modalPage = Math.min(Math.max(1, modalPage), totalPages);
    const startIdx = (modalPage - 1) * NOTIFICATIONS_PAGE_SIZE;
    const pageItems = filtered.slice(startIdx, startIdx + NOTIFICATIONS_PAGE_SIZE);

    if (totalPages > 1) {
      pagerWrap.classList.remove("hidden");
      pagerWrap.classList.add("flex");
      pageLabel.textContent = `Page ${modalPage} of ${totalPages} (${totalCount} notifications)`;
      previousBtn.disabled = modalPage <= 1;
      nextBtn.disabled = modalPage >= totalPages;
    } else {
      pagerWrap.classList.add("hidden");
      pagerWrap.classList.remove("flex");
    }

    modalList.replaceChildren();
    if (!pageItems.length) {
      modalList.append(text("li", "px-5 py-10 text-center text-sm text-muted", "No notifications match this filter."));
      return;
    }
    for (const item of pageItems) {
      modalList.append(buildNotificationListItem(item, false));
    }
  };

  previousBtn.addEventListener("click", () => {
    if (modalPage <= 1) return;
    modalPage -= 1;
    renderModalContent();
    listWrap.scrollTop = 0;
  });

  nextBtn.addEventListener("click", () => {
    modalPage += 1;
    renderModalContent();
    listWrap.scrollTop = 0;
  });

  for (const [key, label] of filters) {
    const btn = text("button", "", label);
    btn.type = "button";
    btn.addEventListener("click", () => {
      notificationModalFilter = key;
      modalPage = 1;
      renderModalContent();
      listWrap.scrollTop = 0;
    });
    filterBtns[key] = btn;
    filterBar.append(btn);
  }

  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    activeNotificationsDialog = null;
    renderActiveNotificationsModal = null;
    dialog.remove();
    byId("notificationsButton")?.focus();
  });

  document.body.append(dialog);
  activeNotificationsDialog = dialog;
  renderActiveNotificationsModal = renderModalContent;
  renderModalContent();
  dialog.showModal();
}

function setupNotificationUi() {
  const wrap = byId("notificationsWrap");
  const btn = byId("notificationsButton");
  const dropdown = byId("notificationsDropdown");
  const markReadBtn = byId("notificationsMarkRead");
  const displayAllBtn = byId("displayAllNotificationsBtn");
  if (!wrap || !btn || !dropdown) return;

  btn.addEventListener("click", () => {
    const isOpen = !dropdown.classList.contains("hidden");
    setNotificationsDropdownOpen(!isOpen);
  });
  markReadBtn?.addEventListener("click", markNotificationsRead);
  displayAllBtn?.addEventListener("click", openNotificationsModal);

  document.addEventListener("pointerdown", event => {
    if (!dropdown.classList.contains("hidden") && !wrap.contains(event.target)) {
      setNotificationsDropdownOpen(false);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !dropdown.classList.contains("hidden")) {
      setNotificationsDropdownOpen(false);
      btn.focus();
    }
  });
  renderNotificationControls();
}

async function refreshNotifications() {
  if (!byId("notificationsButton")) return;
  try {
    const response = await fetch("/api/dashboard/notifications", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 401) {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!response.ok) return;
    const payload = await response.json();
    const scope = (payload.gateway && (payload.gateway.branch_id || payload.gateway.status)) || "local";
    notificationScope = scope;
    const keys = notificationStorageKeys(scope);
    const prevMap = readStorageJson("sessionStorage", keys.prevState, null);
    const { nextMap, triggeredEvents } = detectNotificationTransitions(prevMap, payload.devices || [], payload.checked_at);
    writeStorageJson("sessionStorage", keys.prevState, nextMap);

    let localEvents = readStorageJson("localStorage", keys.feed, []);
    if (!Array.isArray(localEvents)) localEvents = [];
    if (triggeredEvents.length) {
      localEvents = [...triggeredEvents, ...localEvents].slice(0, 100);
      writeStorageJson("localStorage", keys.feed, localEvents);
      for (const evt of triggeredEvents) {
        pushToastNotification(evt);
      }
    }

    mergedNotifications = mergeNotificationEvents(payload.events || [], localEvents);
    renderNotificationControls();
  } catch {
    // Keep existing rendered notification state cleanly when transient poll fails
  }
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
    if (page === "overview") await Promise.all([refreshHistory(), refreshOverviewAnalytics(false)]);
    await refreshNotifications();
    byId("pageNotice").classList.add("hidden");
  } catch {
    byId("pageNotice").textContent = "Local data could not be refreshed. Any values shown are from the last successful check.";
    byId("pageNotice").classList.remove("hidden");
    byId("checkedAt").textContent = "Local data refresh failed";
    const checkedAtDot = byId("checkedAtDot");
    if (checkedAtDot) checkedAtDot.className = "size-2 shrink-0 rounded-full bg-negative";
  } finally {
    busy = false;
    button.disabled = false;
  }
}

setupNotificationUi();

const menu = byId("menuToggle");
menu.addEventListener("click", () => {
  const nav = byId("sideNav");
  const open = nav.classList.toggle("hidden") === false;
  nav.classList.toggle("flex", open);
  menu.setAttribute("aria-expanded", String(open));
});
byId("refreshButton").addEventListener("click", () => {
  if (page === "overview") lastAnalyticsRefreshAt = 0;
  refresh();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
refresh();
setInterval(() => { if (!document.hidden && !paused) refresh(); }, 4000);

if (page === "overview") {
  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll("[data-analytics-period]").forEach(button => button.addEventListener("click", () => {
      const nextPeriod = button.dataset.analyticsPeriod;
      if (!nextPeriod || nextPeriod === overviewAnalyticsPeriod) return;
      overviewAnalyticsPeriod = nextPeriod;
      updateAnalyticsPeriodButtons(overviewAnalyticsPeriod);
      refreshOverviewAnalytics(true);
    }));
    document.querySelectorAll("[data-machine-metric]").forEach(button => button.addEventListener("click", () => {
      const nextMetric = button.dataset.machineMetric;
      if (!nextMetric || nextMetric === overviewMachineMetric) return;
      overviewMachineMetric = nextMetric;
      updateMachineMetricButtons(overviewMachineMetric);
      if (latestOverviewAnalytics) renderMachineMetricsChart(latestOverviewAnalytics);
    }));
  }
  byId("pauseButton").addEventListener("click", () => {
    paused = !paused;
    byId("pauseButton").setAttribute("aria-pressed", String(paused));
    byId("pauseButton").textContent = paused ? "Resume refresh" : "Pause refresh";
    if (!paused) refresh();
  });
  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll("[data-history-category]").forEach(button => button.addEventListener("click", () => {
      const nextCategory = button.dataset.historyCategory;
      if (!nextCategory || nextCategory === historyCategory || !historyViewState[nextCategory]) return;
      historyCategory = nextCategory;
      syncHistoryControls();
      refreshHistory();
    }));
    document.querySelectorAll("[data-history-filter]").forEach(button => button.addEventListener("click", () => {
      const nextDelivery = button.dataset.historyFilter;
      if (!nextDelivery) return;
      const viewState = historyViewState[historyCategory] || historyViewState.lpg;
      if (viewState.delivery === nextDelivery) return;
      viewState.delivery = nextDelivery;
      viewState.page = 1;
      syncHistoryControls();
      refreshHistory();
    }));
  }
  byId("historyPeriod")?.addEventListener("change", event => {
    const nextPeriod = event.target?.value || "all";
    const viewState = historyViewState[historyCategory] || historyViewState.lpg;
    if (viewState.period === nextPeriod) return;
    viewState.period = nextPeriod;
    viewState.page = 1;
    syncHistoryControls();
    refreshHistory();
  });
  byId("historyPrevPage")?.addEventListener("click", () => {
    const viewState = historyViewState[historyCategory] || historyViewState.lpg;
    if (viewState.page <= 1) return;
    viewState.page -= 1;
    refreshHistory();
  });
  byId("historyNextPage")?.addEventListener("click", () => {
    const viewState = historyViewState[historyCategory] || historyViewState.lpg;
    if (viewState.page >= historyPageMeta.total_pages) return;
    viewState.page += 1;
    refreshHistory();
  });
  syncHistoryControls();
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
