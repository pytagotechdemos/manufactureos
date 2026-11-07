import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/permissions";

describe("hasPermission", () => {
  it("grants an explicitly assigned permission", () => {
    expect(hasPermission(["inventory.receive"], "inventory.receive")).toBe(true);
  });

  it("does not grant an unassigned permission", () => {
    expect(hasPermission(["inventory.read"], "inventory.receive")).toBe(false);
  });

  it("does not treat a role name as a permission", () => {
    expect(hasPermission(["SUPER_ADMIN"], "users.manage")).toBe(false);
  });
});
