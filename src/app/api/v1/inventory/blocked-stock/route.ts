import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../_shared";

export async function POST(request: Request) {
  try {
    const access = await inventoryAccess("inventory.adjust");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await inventory.setBlocked(access.user.id, await request.json()) }, { status: 201 });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}

export const maxDuration = 60;
