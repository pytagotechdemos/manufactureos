import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await inventoryAccess("inventory.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ data: await inventory.movements({ itemId: params.get("itemId") ?? undefined, warehouseId: params.get("warehouseId") ?? undefined, limit: Number(params.get("limit") ?? "50") }) });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}
