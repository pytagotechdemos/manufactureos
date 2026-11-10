import { describe, expect, it } from "vitest";
import {
  workCenterCreateSchema,
  workCenterUpdateSchema,
} from "./work-center-service";

describe("work center validation", () => {
  it("accepts valid work center creation payloads", () => {
    const valid = workCenterCreateSchema.parse({
      code: "WC-CNC-01",
      name: "CNC Milling Station 1",
      hourlyRate: "125000.0000",
      standardMinutes: "45.0000",
    });
    expect(valid.code).toBe("WC-CNC-01");
    expect(valid.name).toBe("CNC Milling Station 1");
    expect(valid.hourlyRate).toBe("125000.0000");
    expect(valid.standardMinutes).toBe("45.0000");
  });

  it("rejects negative rates or standard minutes", () => {
    expect(
      workCenterCreateSchema.safeParse({
        code: "WC-01",
        name: "Test",
        hourlyRate: "-1000",
        standardMinutes: "30",
      }).success,
    ).toBe(false);

    expect(
      workCenterCreateSchema.safeParse({
        code: "WC-01",
        name: "Test",
        hourlyRate: "1000",
        standardMinutes: "-5",
      }).success,
    ).toBe(false);
  });

  it("validates partial work center updates", () => {
    const update = workCenterUpdateSchema.parse({
      name: "Updated Assembly Line",
      hourlyRate: "150000",
      status: "INACTIVE",
    });
    expect(update.name).toBe("Updated Assembly Line");
    expect(update.hourlyRate).toBe("150000");
    expect(update.status).toBe("INACTIVE");
  });

  it("rejects invalid status in work center updates", () => {
    expect(
      workCenterUpdateSchema.safeParse({
        status: "DELETED",
      }).success,
    ).toBe(false);
  });
});
