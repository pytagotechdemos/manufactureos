import { describe, expect, it } from "vitest";
import { createUserSchema } from "./user-admin-service";

describe("user admin validation", () => {
  const validUser = {
    name: "John Operator",
    email: "john.operator@factory.local",
    password: "SecurePassword123!",
    roleId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  };

  it("accepts valid user creation payload", () => {
    const result = createUserSchema.parse(validUser);
    expect(result.name).toBe("John Operator");
    expect(result.email).toBe("john.operator@factory.local");
    expect(result.roleId).toBe("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d");
  });

  it("normalizes email to lowercase and trims whitespace", () => {
    const result = createUserSchema.parse({
      ...validUser,
      email: "  Jane.Planner@Factory.LOCAL  ",
    });
    expect(result.email).toBe("jane.planner@factory.local");
  });

  it("rejects passwords shorter than 12 characters", () => {
    expect(
      createUserSchema.safeParse({
        ...validUser,
        password: "shortpass",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid email formats", () => {
    expect(
      createUserSchema.safeParse({
        ...validUser,
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it("rejects non-uuid roleId", () => {
    expect(
      createUserSchema.safeParse({
        ...validUser,
        roleId: "role-123",
      }).success,
    ).toBe(false);
  });
});
