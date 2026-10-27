export type PublicOrganization = { id: string; name: string };
export type OrganizationDirectory = { status: "ready" | "unavailable"; organizations: PublicOrganization[] };

export async function getPublicOrganizations(): Promise<OrganizationDirectory> {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!base) return { status: "unavailable", organizations: [] };
  try {
    const response = await fetch(`${base}/public/organizations`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { status: "unavailable", organizations: [] };
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("organizations" in body) || !Array.isArray(body.organizations) || body.organizations.length > 1000) return { status: "unavailable", organizations: [] };
    const organizations: PublicOrganization[] = [];
    for (const row of body.organizations) {
      if (!row || typeof row !== "object" || typeof row.id !== "string" || !row.id || row.id.length > 128 || typeof row.name !== "string" || !row.name || row.name.length > 120) return { status: "unavailable", organizations: [] };
      organizations.push({ id: row.id, name: row.name });
    }
    return { status: "ready", organizations };
  } catch {
    return { status: "unavailable", organizations: [] };
  }
}
