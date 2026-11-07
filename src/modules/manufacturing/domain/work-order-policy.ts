import Decimal from "decimal.js";

export type WorkOrderState = "PENDING" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";

export class WorkOrderPolicyError extends Error {
  constructor(readonly code: "INVALID_STATE" | "DEPENDENCY" | "INVALID_OUTPUT", message: string) {
    super(message);
    this.name = "WorkOrderPolicyError";
  }
}

export function assertCanStart(status: WorkOrderState, previousStatus?: WorkOrderState) {
  if (status !== "PENDING" && status !== "PAUSED") throw new WorkOrderPolicyError("INVALID_STATE", "Work order cannot be started from its current state");
  if (previousStatus && previousStatus !== "COMPLETED") throw new WorkOrderPolicyError("DEPENDENCY", "Previous work order must be completed first");
}

export function assertCanPause(status: WorkOrderState) {
  if (status !== "IN_PROGRESS") throw new WorkOrderPolicyError("INVALID_STATE", "Only active work orders can be paused");
}

export function assertCanComplete(status: WorkOrderState, currentCompleted: string, currentRejected: string, target: string, completedQty: string, rejectedQty: string) {
  if (status !== "IN_PROGRESS") throw new WorkOrderPolicyError("INVALID_STATE", "Only active work orders can be completed");
  const total = new Decimal(currentCompleted).plus(currentRejected).plus(completedQty).plus(rejectedQty);
  if (total.greaterThan(target)) throw new WorkOrderPolicyError("INVALID_OUTPUT", "Reported output exceeds work order target");
}
