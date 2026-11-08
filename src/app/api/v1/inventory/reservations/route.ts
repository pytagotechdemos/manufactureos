import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await inventoryAccess("inventory.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    return NextResponse.json({ data: await inventory.reservations({
      itemId: params.get("itemId") ?? undefined,
      warehouseId: params.get("warehouseId") ?? undefined,
      status: status === "ACTIVE" || status === "RELEASED" || status === "CONSUMED" ? status : undefined,
    }) });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await inventoryAccess("inventory.reserve");
    if ("error" in access) return access.error;
    const data = await inventory.reserve(access.user.id, await request.json());
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}

export const maxDuration = 60;
