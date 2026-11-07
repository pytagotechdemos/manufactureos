"use client";

import { useState } from "react";

export default function ProductionReceiptsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    manufacturingOrderId: "",
    inspectionId: "",
    acceptedQty: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/production-receipts/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Failed to post receipt");
      setNotice("Finished goods posted successfully.");
      setFormData({ manufacturingOrderId: "", inspectionId: "", acceptedQty: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post production receipt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Manufacturing</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Production Receipts</h1>
        <p className="mt-2 text-sm text-slate-600">Post accepted QC inspections to finished goods inventory.</p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold mb-4">Post Production Receipt</h2>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">Manufacturing Order</label>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => setFormData({ ...formData, manufacturingOrderId: e.target.value })} value={formData.manufacturingOrderId} />
          <label className="block text-sm font-medium mt-4">Inspection ID</label>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => setFormData({ ...formData, inspectionId: e.target.value })} required value={formData.inspectionId} />
          <label className="block text-sm font-medium mt-2">Accepted Quantity</label>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(e) => setFormData({ ...formData, acceptedQty: e.target.value })} required step="0.000001" type="number" value={formData.acceptedQty} />
          <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
            {loading ? "Posting..." : "Post Production Receipt"}
          </button>
        </form>
      </section>
    </div>
  );
}
