import { describe, expect, it } from "vitest";
import { assertCanComplete, assertCanPause, assertCanStart, WorkOrderPolicyError } from "@/modules/manufacturing/domain/work-order-policy";

describe("work order policies", () => {
  it("allows starting pending work with completed predecessor", () => {
    expect(() => assertCanStart("PENDING", "COMPLETED")).not.toThrow();
  });

  it("allows starting the first operation without predecessor", () => {
    expect(() => assertCanStart("PENDING")).not.toThrow();
  });

  it("allows resuming paused work", () => {
    expect(() => assertCanStart("PAUSED", "COMPLETED")).not.toThrow();
  });

  it("blocks start while the previous sequence is unfinished", () => {
    expect(() => assertCanStart("PENDING", "IN_PROGRESS")).toThrowError(WorkOrderPolicyError);
    try { assertCanStart("PENDING", "IN_PROGRESS"); } catch (error) { expect(error).toMatchObject({ code: "DEPENDENCY" }); }
  });

  it("prevents starting completed work and pausing idle work", () => {
    expect(() => assertCanStart("COMPLETED")).toThrow(/cannot be started/);
    expect(() => assertCanPause("PENDING")).toThrow(/Only active/);
  });

  it("allows partial accepted/rejected reporting within target", () => {
    expect(() => assertCanComplete("IN_PROGRESS", "2", "1", "10", "4", "2")).not.toThrow();
  });

  it("rejects output that exceeds target using decimal arithmetic", () => {
    expect(() => assertCanComplete("IN_PROGRESS", "8.000001", "0", "10", "2", "0.000001")).toThrow(/exceeds work order target/);
  });

  it("rejects completion when not in progress", () => {
    expect(() => assertCanComplete("PAUSED", "0", "0", "10", "1", "0")).toThrow(/Only active/);
  });
});
