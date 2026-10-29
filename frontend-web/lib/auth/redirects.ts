// Preserve a future operational destination; it is never an authorization grant.
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded) || decoded.startsWith("//") || /%2f|%5c/i.test(value)) return null;
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid" || !/^\/(branches|dashboard|personnel|account)(\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function workspaceDestination(value: unknown): string {
  const next = safeReturnTo(value);
  return next ? `/membership-status?${new URLSearchParams({ next })}` : "/membership-status";
}

// Only routes already backed by current authorization may be resumed after login.
export function activeDestination(value: unknown, role: string | null): string {
  const next = safeReturnTo(value);
  if (role === "owner" && next === "/branches/new") return next;
  if (next === "/branches" || next?.startsWith("/branches?")) return next;
  return "/branches";
}
