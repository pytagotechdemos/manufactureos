"use client";

import { useState, useEffect } from "react";

interface CostRecord {
  id: string;
  moNumber: string;
  itemSku: string;
  estimatedCost: string;
  actualCost: string;
  variance: string;
  status: string;
}

export default function ReportsPage() {
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchCosts() {
    try {
      const res = await fetch("/api/v1/manufacturing/orders", {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setCosts(
          (data.data || []).map((mo: { id: string; number: string; itemSku?: string; estimatedCost?: string; actualCost?: string; variance?: string; status: string }) => ({
            id: mo.id,
            moNumber: mo.number,
            itemSku: mo.itemSku || "-",
            estimatedCost: mo.estimatedCost || "0.00",
            actualCost: mo.actualCost || "0.00",
            variance: mo.variance || "0.00",
            status: mo.status,
          })),
        );
      }
    } catch (e) {
      console.error("Failed to load costing data", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCosts();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Costing &amp; Reports</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Costing &amp; Reports</h1>
        <p className="mt-2 text-sm text-slate-600">View manufacturing cost estimates, actuals, and variance analysis.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Manufacturing Cost Summary</h2>
          </div>
          <div className="p-4">
            {loading ? (
              <p className="text-sm text-slate-500">Loading costing data...</p>
            ) : costs.length === 0 ? (
              <p className="text-sm text-slate-500">No manufacturing cost records.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">MO Number</th>
                      <th className="px-4 py-3">Item SKU</th>
                      <th className="px-4 py-3 text-right">Estimated</th>
                      <th className="px-4 py-3 text-right">Actual</th>
                      <th className="px-4 py-3 text-right">Variance</th>
                      <th className="px-5 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {costs.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-3 font-medium">{c.moNumber}</td>
                        <td className="px-4 py-3">{c.itemSku}</td>
                        <td className="px-4 py-3 text-right">{c.estimatedCost}</td>
                        <td className="px-4 py-3 text-right">{c.actualCost}</td>
                        <td className={`px-4 py-3 text-right font-medium ${Number(c.variance) >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {c.variance}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs ${c.status === "COMPLETED" ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-500"}`}>
                            {c.status}
                          </span>
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
            <h2 className="font-semibold">Quick Actions</h2>
          </div>
          <div className="p-4 space-y-3">
            <button className="w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left">
              View Cost Detail Report
            </button>
            <button className="w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left">
              Export Variance Analysis
            </button>
            <button className="w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left">
              View WIP Valuation
            </button>
            <button className="w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left">
              View Inventory Valuation
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
