"use client";

import { useState } from "react";

interface WorkOrder {
  id: string;
  number: string;
  moNumber: string;
  workCenter: string;
  status: string;
  plannedStart: string | null;
  actualStart: string | null;
  plannedEnd: string | null;
  actualEnd: string | null;
}

export default function WorkOrderExecutionPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([
    { id: "1", number: "WO-2026-001", moNumber: "MO-2026-001", workCenter: "Assembly Station 1", status: "RELEASED", plannedStart: "2026-11-07T08:00:00Z", actualStart: null, plannedEnd: "2026-11-07T16:00:00Z", actualEnd: null },
    { id: "2", number: "WO-2026-002", moNumber: "MO-2026-002", workCenter: "CNC Station 2", status: "RELEASED", plannedStart: "2026-11-07T09:00:00Z", actualStart: null, plannedEnd: "2026-11-07T17:00:00Z", actualEnd: null },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function fetchWorkOrders() {
    try {
      const res = await fetch("/api/v1/manufacturing/orders", {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setWorkOrders((data.data || []).map((mo: { id: string; number: string; status: string }) => ({
          id: mo.id,
          number: mo.number,
          moNumber: mo.number,
          workCenter: "-",
          status: mo.status,
          plannedStart: null,
          actualStart: null,
          plannedEnd: null,
          actualEnd: null,
        })));
      }
    } catch (e) {
      console.error("Failed to load work orders", e);
    }
  }

  async function startWorkOrder(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manufacturing/work-orders/${id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to start work order");
      setNotice(`Work order started.`);
      await fetchWorkOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start work order");
    } finally {
      setLoading(false);
    }
  }

  async function pauseWorkOrder(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manufacturing/work-orders/${id}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to pause work order");
      setNotice(`Work order paused.`);
      await fetchWorkOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause work order");
    } finally {
      setLoading(false);
    }
  }

  async function completeWorkOrder(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manufacturing/work-orders/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to complete work order");
      setNotice(`Work order completed.`);
      await fetchWorkOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete work order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Manufacturing</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Work Order Execution</h1>
        <p className="mt-2 text-sm text-slate-600">Start, pause, and complete work orders. Track time entries and work center assignments.</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Active Work Orders</h2>
        </div>
        <div className="p-4">
          {workOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No work orders found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">WO Number</th>
                    <th className="px-4 py-3">MO Number</th>
                    <th className="px-4 py-3">Work Center</th>
                    <th className="px-4 py-3 text-right">Status</th>
                    <th className="px-4 py-3 text-right">Planned Start</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workOrders.map((wo) => (
                    <tr key={wo.id}>
                      <td className="px-5 py-3 font-medium">{wo.number}</td>
                      <td className="px-4 py-3">{wo.moNumber}</td>
                      <td className="px-4 py-3">{wo.workCenter}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${wo.status === "IN_PROGRESS" ? "bg-blue-50 text-blue-700" : wo.status === "COMPLETED" ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-500"}`}>
                          {wo.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{wo.plannedStart || "-"}</td>
                      <td className="px-5 py-3 text-right">
                        {wo.status === "RELEASED" ? (
                          <button onClick={() => startWorkOrder(wo.id)} disabled={loading} className="rounded-md bg-blue-700 px-3 py-1.5 text-xs text-white disabled:opacity-60 hover:bg-blue-800">Start</button>
                        ) : wo.status === "IN_PROGRESS" ? (
                          <div className="flex gap-1">
                            <button onClick={() => pauseWorkOrder(wo.id)} disabled={loading} className="rounded-md bg-yellow-600 px-3 py-1.5 text-xs text-white disabled:opacity-60 hover:bg-yellow-700">Pause</button>
                            <button onClick={() => completeWorkOrder(wo.id)} disabled={loading} className="rounded-md bg-green-600 px-3 py-1.5 text-xs text-white disabled:opacity-60 hover:bg-green-700">Complete</button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Work Order Actions</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Work Order ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Enter WO ID" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">Action</label>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option>Start</option>
                <option>Pause</option>
                <option>Complete</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading}>
                {loading ? "Processing..." : "Execute Action"}
              </button>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Time Entry</h3>
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              setError(null);
              try {
                setNotice("Time entry recorded (demo mode).");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to record time entry");
              } finally {
                setLoading(false);
              }
            }}>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Work Order ID</label>
                  <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="WO ID" required />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Hours</label>
                  <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="number" step="0.01" required />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Work Center</label>
                  <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Work Center" required />
                </div>
              </div>
              <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
                {loading ? "Recording..." : "Record Time Entry"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
