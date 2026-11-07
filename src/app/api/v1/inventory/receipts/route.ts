import { NextResponse } from "next/server";
import { inventory, inventoryAccess, inventoryErrorResponse } from "../_shared";

export async function POST(request: Request) {
  try {
    const access = await inventoryAccess("inventory.receive");
    if ("error" in access) return access.error;
    const data = await inventory.receive(access.user.id, await request.json());
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return inventoryErrorResponse(error);
  }
}
