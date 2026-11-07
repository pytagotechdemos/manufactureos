"use client";

import { useState, useEffect } from "react";

interface PendingOrder {
  id: string;
  number: string;
  item: { sku: string; name: string };
  status: string;
}

interface QCInspection {
  id: string;
  number: string;
  item: { sku: string; name: string };
  status: string;
  createdAt: string;
  manufacturingOrder: { sku: string } | null;
  acceptedQty: string;
  rejectedQty: string;
  reworkQty: string;
}

export default function QualityPage() {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [inspections, setInspections] = useState<QCInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchPendingOrders();
    fetchInspections();
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    manufacturingOrderId: "",
    quantity: "",
    acceptedQty: "0",
    rejectedQty: "0",
    reworkQty: "0",
    defectClassification: "",
    notes: "",
  });

  async function fetchPendingOrders() {
    try {
      const res = await fetch("/api/v1/manufacturing/orders", {
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setPendingOrders(data.data || []);
      }
    } catch (e) {
      console.error("Failed to load MOs", e);
    }
  }

  async function fetchInspections() {
    try {
      const res = await fetch("/api/v1/qc/inspections", {
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setInspections(data.data || []);
      }
    } catch (e) {
      console.error("Failed to load inspections", e);
    }
  }

  async function submitInspection(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/v1/qc/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to create inspection");
      }
      setShowForm(false);
      setNotice("QC inspection created successfully.");
      await fetchInspections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create inspection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Quality Control</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Quality Control</h1>
        <p className="mt-2 text-sm text-slate-600">Inspect production output, record accepted/rejected quantities, and post finished goods.</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Pending Inspections</h2>
          </div>
          <div className="p-4">
            {pendingOrders.length === 0 ? (
              <p className="text-sm text-slate-500">No pending inspections.</p>
            ) : (
              <div className="space-y-3">
                {pendingOrders.map((bom) => (
                  <div key={bom.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{bom.number}</p>
                        <p className="text-xs text-slate-500">{bom.item.sku} · {bom.item.name}</p>
                      </div>
                    </div>
                    <button
                      className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                      onClick={() => {
                        setFormData({ ...formData, manufacturingOrderId: bom.id });
                        setShowForm(true);
                      }}
                    >
                      Inspect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Create Inspection</h2>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? "Hide Form" : "New Inspection"}
            </button>
          </div>
          {showForm ? (
            <form className="mt-4 space-y-4" onSubmit={submitInspection}>
              <label className="block text-sm font-medium">Manufacturing Order</label>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setFormData({ ...formData, manufacturingOrderId: event.target.value })} value={formData.manufacturingOrderId}>
                <option value="">Select MO</option>
                {pendingOrders.map((bom) => (
                  <option key={bom.id} value={bom.id}>{bom.number}</option>
                ))}
              </select>
              <label className="block text-sm font-medium mt-2">Inspected Quantity</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setFormData({ ...formData, quantity: event.target.value })} required type="number" step="0.000001" value={formData.quantity} />
              <label className="block text-sm font-medium mt-2">Accepted Quantity</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setFormData({ ...formData, acceptedQty: event.target.value })} required type="number" step="0.000001" value={formData.acceptedQty} />
              <label className="block text-sm font-medium mt-2">Rejected Quantity</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setFormData({ ...formData, rejectedQty: event.target.value })} type="number" step="0.000001" value={formData.rejectedQty} />
              <label className="block text-sm font-medium mt-2">Rework Quantity</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setFormData({ ...formData, reworkQty: event.target.value })} type="number" step="0.000001" value={formData.reworkQty} />
              <label className="block text-sm font-medium mt-2">Defect Classification</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setFormData({ ...formData, defectClassification: event.target.value })} placeholder="e.g. Dimension mismatch" />
              <label className="block text-sm font-medium mt-2">Notes</label>
              <textarea className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setFormData({ ...formData, notes: event.target.value })} value={formData.notes} rows={2} />
              <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
                {loading ? "Posting..." : "Post Inspection"}
              </button>
            </form>
          ) : null}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Inspection History</h2>
        </div>
        <div className="p-4">
          {inspections.length === 0 ? (
            <p className="text-sm text-slate-500">No inspections recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-5 py-3">Number</th><th className="px-4 py-3">MO</th><th className="px-4 py-3 text-right">Accepted</th><th className="px-4 py-3 text-right">Rejected</th><th className="px-4 py-3 text-right">Rework</th><th className="px-5 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inspections.map((inspection) => (
                    <tr key={inspection.id}>
                      <td className="px-5 py-3">{inspection.number}</td>
                      <td className="px-4 py-3">{inspection.manufacturingOrder?.sku || "-"}</td>
                      <td className="px-4 py-3 text-right">{inspection.acceptedQty}</td>
                      <td className="px-4 py-3 text-right">{inspection.rejectedQty}</td>
                      <td className="px-4 py-3 text-right">{inspection.reworkQty}</td>
                      <td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-xs ${inspection.status === "POSTED" ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-500"}`}>{inspection.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
