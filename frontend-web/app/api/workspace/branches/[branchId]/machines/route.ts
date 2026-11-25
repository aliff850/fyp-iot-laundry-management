import { NextResponse } from "next/server";
import { getRemoteMachines } from "@/lib/auth/business";

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ branchId: string }> },
) {
  const { branchId } = await context.params;
  if (!branchId || !UUID_REGEX.test(branchId)) {
    return NextResponse.json(
      { ok: false, status: 400, message: "Invalid branch identifier." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = await getRemoteMachines(branchId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, status: result.status, message: result.message },
      { status: result.status, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, value: result.value },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
