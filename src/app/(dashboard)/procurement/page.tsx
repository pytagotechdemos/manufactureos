"use client";

import { useState } from "react";

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: string;
  status: string;
  expectedDelivery: string | null;
  totalAmount: string;
  createdAt: string;
}

interface GoodsReceipt {
  id: string;
  number: string;
  purchaseOrder: string;
  status: string;
  postedAt: string | null;
  createdAt: string;
}

export default function ProcurementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function fetchPurchaseOrders() {
    try {
      const res = await fetch("/api/v1/procurement/purchase-orders", {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setPurchaseOrders(data.data || []);
      }
    } catch (e) {
      console.error("Failed to load purchase orders", e);
    }
  }

  async function fetchGoodsReceipts() {
    try {
      const res = await fetch("/api/v1/procurement/goods-receipts", {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setGoodsReceipts(data.data || []);
      }
    } catch (e) {
      console.error("Failed to load goods receipts", e);
    }
  }

  async function handleCreatePO(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      const body = {
        number: formData.get("number"),
        supplierId: formData.get("supplierId"),
        warehouseId: formData.get("warehouseId"),
        expectedDelivery: formData.get("expectedDelivery") || undefined,
        lines: [
          {
            itemId: formData.get("itemId"),
            quantity: formData.get("quantity"),
            unitCost: formData.get("unitCost"),
            uomId: formData.get("uomId"),
          },
        ],
      };
      const res = await fetch("/api/v1/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create purchase order");
      setNotice("Purchase order created successfully.");
      await fetchPurchaseOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create purchase order");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateReceipt(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      const body = {
        number: formData.get("number"),
        purchaseOrderId: formData.get("purchaseOrderId"),
        warehouseId: formData.get("warehouseId"),
        idempotencyKey: formData.get("idempotencyKey"),
        lines: [
          {
            purchaseOrderLineId: formData.get("purchaseOrderLineId"),
            quantity: formData.get("quantity"),
          },
        ],
      };
      const res = await fetch("/api/v1/procurement/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to create goods receipt");
      setNotice("Goods receipt created successfully.");
      await fetchGoodsReceipts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create goods receipt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-700">Procurement</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Procurement</h1>
        <p className="mt-2 text-sm text-slate-600">Manage purchase requests, purchase orders, and goods receipts.</p>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Purchase Orders</h2>
          </div>
          <div className="p-4">
            {purchaseOrders.length === 0 ? (
              <p className="text-sm text-slate-500">No purchase orders.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Number</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3 text-right">Status</th>
                      <th className="px-4 py-3 text-right">Expected</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-5 py-3 text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseOrders.map((po) => (
                      <tr key={po.id}>
                        <td className="px-5 py-3 font-medium">{po.number}</td>
                        <td className="px-4 py-3">{po.supplier}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs ${po.status === "APPROVED" ? "bg-green-50 text-green-700" : po.status === "DRAFT" ? "bg-slate-50 text-slate-500" : "bg-blue-50 text-blue-700"}`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">{po.expectedDelivery || "-"}</td>
                        <td className="px-4 py-3 text-right">{po.totalAmount}</td>
                        <td className="px-5 py-3 text-right">{po.createdAt}</td>
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
            <h2 className="font-semibold">Create Purchase Order</h2>
          </div>
          <div className="p-4">
            <form className="space-y-4" onSubmit={handleCreatePO}>
              <label className="block text-sm font-medium">PO Number</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="number" placeholder="PO-2026-001" required />
              <label className="block text-sm font-medium mt-2">Supplier ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="supplierId" placeholder="Supplier UUID" required />
              <label className="block text-sm font-medium mt-2">Warehouse ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="warehouseId" placeholder="Warehouse UUID" required />
              <label className="block text-sm font-medium mt-2">Item ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="itemId" placeholder="Item UUID" required />
              <label className="block text-sm font-medium mt-2">Quantity</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="quantity" type="number" step="0.000001" required />
              <label className="block text-sm font-medium mt-2">Unit Cost</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="unitCost" type="number" step="0.0001" required />
              <label className="block text-sm font-medium mt-2">UOM ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="uomId" placeholder="UOM UUID" required />
              <label className="block text-sm font-medium mt-2">Expected Delivery</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="expectedDelivery" type="datetime-local" />
              <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
                {loading ? "Creating..." : "Create Purchase Order"}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Goods Receipts</h2>
          </div>
          <div className="p-4">
            {goodsReceipts.length === 0 ? (
              <p className="text-sm text-slate-500">No goods receipts.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Number</th>
                      <th className="px-4 py-3">Purchase Order</th>
                      <th className="px-4 py-3 text-right">Status</th>
                      <th className="px-5 py-3 text-right">Posted</th>
                      <th className="px-5 py-3 text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {goodsReceipts.map((gr) => (
                      <tr key={gr.id}>
                        <td className="px-5 py-3 font-medium">{gr.number}</td>
                        <td className="px-4 py-3">{gr.purchaseOrder}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs ${gr.status === "POSTED" ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-500"}`}>
                            {gr.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">{gr.postedAt || "-"}</td>
                        <td className="px-5 py-3 text-right">{gr.createdAt}</td>
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
            <h2 className="font-semibold">Post Goods Receipt</h2>
          </div>
          <div className="p-4">
            <form className="space-y-4" onSubmit={handleCreateReceipt}>
              <label className="block text-sm font-medium">Receipt Number</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="number" placeholder="GR-2026-001" required />
              <label className="block text-sm font-medium mt-2">Purchase Order ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="purchaseOrderId" placeholder="PO UUID" required />
              <label className="block text-sm font-medium mt-2">Warehouse ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="warehouseId" placeholder="Warehouse UUID" required />
              <label className="block text-sm font-medium mt-2">Idempotency Key</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="idempotencyKey" placeholder="Unique key (min 8 chars)" required />
              <label className="block text-sm font-medium mt-2">PO Line ID</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="purchaseOrderLineId" placeholder="PO Line UUID" required />
              <label className="block text-sm font-medium mt-2">Received Quantity</label>
              <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="quantity" type="number" step="0.000001" required />
              <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">
                {loading ? "Posting..." : "Post Goods Receipt"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
