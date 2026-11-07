import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../../../_shared";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await inventoryAccess("inventory.reserve");
    if ("error" in access) return access.error;
    const { id } = await context.params;
    const data = await inventory.releaseReservation(access.user.id, id);
    return NextResponse.json({ data });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}
