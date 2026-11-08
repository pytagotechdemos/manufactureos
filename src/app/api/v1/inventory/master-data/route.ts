import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../_shared";

export async function GET() {
  try {
    const access = await inventoryAccess("inventory.read");
    if ("error" in access) return access.error;
    return NextResponse.json({ data: await inventory.masterData() });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}

export const maxDuration = 60;
