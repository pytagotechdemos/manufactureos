import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const access = await inventoryAccess("inventory.read");
    if ("error" in access) return access.error;
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ data: await inventory.balances({ itemId: params.get("itemId") ?? undefined, warehouseId: params.get("warehouseId") ?? undefined, search: params.get("search") ?? undefined }) });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}

export const maxDuration = 60;
