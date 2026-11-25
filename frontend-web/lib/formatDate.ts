const MYT_TIME_ZONE = "Asia/Kuala_Lumpur";

const MYT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-MY", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: MYT_TIME_ZONE,
});

const MYT_SHORT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-MY", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: MYT_TIME_ZONE,
});

const MYT_DATE_FORMATTER = new Intl.DateTimeFormat("en-MY", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: MYT_TIME_ZONE,
});

const MYT_TIME_FORMATTER = new Intl.DateTimeFormat("en-MY", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: MYT_TIME_ZONE,
});

function parseValidDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatMytDateTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const parsed = parseValidDate(iso);
  if (!parsed) return fallback === "—" ? String(iso) : fallback;
  return `${MYT_DATE_TIME_FORMATTER.format(parsed)} MYT`;
}

export function formatMytShortDateTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const parsed = parseValidDate(iso);
  if (!parsed) return fallback === "—" ? String(iso) : fallback;
  return `${MYT_SHORT_DATE_TIME_FORMATTER.format(parsed)} MYT`;
}

export function formatMytDate(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const parsed = parseValidDate(iso);
  if (!parsed) return fallback === "—" ? String(iso) : fallback;
  return MYT_DATE_FORMATTER.format(parsed);
}

export function formatMytTime(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const parsed = parseValidDate(iso);
  if (!parsed) return fallback === "—" ? String(iso) : fallback;
  return `${MYT_TIME_FORMATTER.format(parsed)} MYT`;
}
