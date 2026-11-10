import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requireAnyPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ManufacturingCostService } from "@/modules/costing/application/manufacturing-cost-service";

const costing = new ManufacturingCostService(prisma);

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 },
      );
    }
    await requireAnyPermission(user.id, ["reports.read", "costing.read"]);

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") ?? undefined;
    const endDate = url.searchParams.get("endDate") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const data = await costing.getCostReport({ startDate, endDate, status });
    return NextResponse.json({ data, count: data.length });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Permission denied" } },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Gagal memuat laporan biaya" } },
      { status: 500 },
    );
  }
}

export const maxDuration = 60;
