import { NextRequest, NextResponse } from "next/server";
import { getNotifications } from "@/lib/auth/business";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rawCategory = params.get("category");
  const safeCategory =
    rawCategory === "machine" || rawCategory === "lpg" ? rawCategory : "all";
  const rawBranchId = params.get("branchId")?.trim() || undefined;
  if (rawBranchId && !UUID_REGEX.test(rawBranchId)) {
    return NextResponse.json(
      { ok: false, status: 400, message: "Invalid branch identifier." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const rawLimit = Number.parseInt(params.get("limit") || "100", 10);
  const safeLimit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(200, rawLimit))
    : 100;

  const result = await getNotifications({
    category: safeCategory,
    branchId: rawBranchId,
    limit: safeLimit,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, status: result.status, message: result.message },
      { status: result.status, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, data: result.value },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
