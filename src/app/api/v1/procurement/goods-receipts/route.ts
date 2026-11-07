import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { ProcurementService } from "@/modules/procurement/application/procurement-service";
import { procurementErrorResponse } from "../_shared";

const service = new ProcurementService(prisma);

export async function GET() {
  try {
    const access = await getCurrentUser();
    if (!access) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }
    await requirePermission(access.id, "inventory.read");
    const data = await prisma.goodsReceipt.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        order: {
          include: { supplier: { select: { code: true, name: true } } },
        },
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });
    return NextResponse.json({ data });
  } catch {
    return procurementErrorResponse(undefined);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getCurrentUser();
    if (!access) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }
    await requirePermission(access.id, "inventory.receive");
    const body = await request.json();
    const receipt = await service.createGoodsReceipt(access.id, body);
    return NextResponse.json({ data: receipt }, { status: 201 });
  } catch {
    return procurementErrorResponse(undefined);
  }
}

