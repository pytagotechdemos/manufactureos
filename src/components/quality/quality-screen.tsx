"use client";

import Decimal from "decimal.js";
import { useCallback, useEffect, useState } from "react";

type Permissions = { canInspect: boolean; canReceive: boolean; canReadInventory: boolean };
type WorkOrder = { id: string; number: string; sequence: number; completedQty: string; rejectedQty: string; status: string };
type PendingOrder = { id: string; number: string; status: string; quantity: string; producedQuantity: string; inspectedQuantity: string; acceptedQuantity: string; rejectedQuantity: string; reworkQuantity: string; item: { sku: string; name: string }; workOrders: WorkOrder[] };
type Inspection = { id: string; number: string; manufacturingOrderId: string; inspectedQty: string; acceptedQty: string; rejectedQty: string; reworkQty: string; status: string; defectCode: string | null; inspectedAt: string; manufacturingOrder: { number: string; status: string; item: { sku: string; name: string } }; productionReceipts: Array<{ id: string; number: string; acceptedQty: string; status: string }> };
type Warehouse = { id: string; code: string; name: string };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed");
  return body;
}

export function QualityScreen({ permissions }: { permissions: Permissions }) {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orderId, setOrderId] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [inspectionNumber, setInspectionNumber] = useState("");
  const [inspectedQty, setInspectedQty] = useState("");
  const [acceptedQty, setAcceptedQty] = useState("");
  const [rejectedQty, setRejectedQty] = useState("0");
  const [reworkQty, setReworkQty] = useState("0");
  const [defectCode, setDefectCode] = useState("");
  const [notes, setNotes] = useState("");
  const [inspectionToReceive, setInspectionToReceive] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptQty, setReceiptQty] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const requests: Promise<unknown>[] = [];
      if (permissions.canInspect) {
        requests.push(fetch("/api/v1/quality/pending-orders", { cache: "no-store" }).then(readJson<{ data: PendingOrder[] }>));
        requests.push(fetch("/api/v1/quality/inspections", { cache: "no-store" }).then(readJson<{ data: Inspection[] }>));
      }
      if (permissions.canReceive && permissions.canReadInventory) requests.push(fetch("/api/v1/quality/warehouses", { cache: "no-store" }).then(readJson<{ data: Warehouse[] }>));
      const results = await Promise.all(requests);
      let index = 0;
      if (permissions.canInspect) {
        const pending = results[index++] as { data: PendingOrder[] };
        const history = results[index++] as { data: Inspection[] };
        setPendingOrders(pending.data);
        setInspections(history.data);
        if (!orderId && pending.data[0]) setOrderId(pending.data[0].id);
      }
      if (permissions.canReceive && permissions.canReadInventory) {
        const warehouseResult = results[index] as { data: Warehouse[] };
        setWarehouses(warehouseResult.data);
        if (!warehouseId && warehouseResult.data[0]) setWarehouseId(warehouseResult.data[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load quality data");
    } finally { setLoading(false); }
  }, [orderId, permissions.canInspect, permissions.canReadInventory, permissions.canReceive, warehouseId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedOrder = pendingOrders.find((order) => order.id === orderId);
  const receivableInspections = inspections.filter((inspection) => {
    const received = inspection.productionReceipts.reduce((sum, receipt) => sum.plus(receipt.acceptedQty), new Decimal(0));
    return inspection.status === "POSTED" && new Decimal(inspection.acceptedQty).greaterThan(received);
  });

  async function submitInspection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orderId) return;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      const created = await readJson<{ data: { id: string } }>(await fetch("/api/v1/quality/inspections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: inspectionNumber, manufacturingOrderId: orderId, ...(workOrderId ? { workOrderId } : {}), inspectedQty, acceptedQty, rejectedQty, reworkQty, defectCode: defectCode || undefined, notes: notes || undefined }),
      }));
      await readJson(await fetch(`/api/v1/quality/inspections/${created.data.id}/post`, { method: "POST" }));
      setNotice("QC inspection posted.");
      setInspectionNumber(""); setInspectedQty(""); setAcceptedQty(""); setRejectedQty("0"); setReworkQty("0"); setDefectCode(""); setNotes("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to post inspection"); }
    finally { setSubmitting(false); }
  }

  async function submitReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const inspection = receivableInspections.find((entry) => entry.id === inspectionToReceive);
    if (!inspection) return;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      await readJson(await fetch("/api/v1/quality/production-receipts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: receiptNumber, manufacturingOrderId: inspection.manufacturingOrderId, inspectionId: inspection.id, warehouseId, acceptedQty: receiptQty, idempotencyKey: crypto.randomUUID() }),
      }));
      setNotice("Accepted finished goods posted to inventory.");
      setReceiptNumber(""); setReceiptQty("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to post finished goods receipt"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-6">
      <header><p className="text-sm font-medium text-blue-700">Quality</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Quality Control</h1><p className="mt-2 text-sm text-slate-600">Inspect manufactured output, record disposition, and receive only accepted quantities into finished goods.</p></header>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</div> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        {permissions.canInspect ? <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Pending inspection orders</h2>
          {pendingOrders.length === 0 ? <p className="mt-3 text-sm text-slate-500">No produced manufacturing orders are awaiting QC.</p> : <div className="mt-3 space-y-2">{pendingOrders.map((order) => <button className={`w-full rounded-md border p-3 text-left ${orderId === order.id ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`} key={order.id} onClick={() => { setOrderId(order.id); setWorkOrderId(""); }} type="button"><span className="font-medium">{order.number} · {order.item.sku}</span><span className="mt-1 block text-xs text-slate-500">Produced {order.producedQuantity} / target {order.quantity} · inspected {order.inspectedQuantity}</span></button>)}</div>}
          {selectedOrder && pendingOrders.length > 0 ? <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={submitInspection}>
            <label className="text-sm font-medium">Inspection number<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setInspectionNumber(event.target.value)} required value={inspectionNumber} /></label>
            <label className="text-sm font-medium">Work order (optional)<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setWorkOrderId(event.target.value)} value={workOrderId}><option value="">MO-level inspection</option>{selectedOrder.workOrders.map((workOrder) => <option key={workOrder.id} value={workOrder.id}>{workOrder.number} · {workOrder.status}</option>)}</select></label>
            <label className="text-sm font-medium">Inspected quantity<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min="0.000001" onChange={(event) => setInspectedQty(event.target.value)} required step="any" type="number" value={inspectedQty} /></label>
            <label className="text-sm font-medium">Accepted<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min="0" onChange={(event) => setAcceptedQty(event.target.value)} required step="any" type="number" value={acceptedQty} /></label>
            <label className="text-sm font-medium">Rejected<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min="0" onChange={(event) => setRejectedQty(event.target.value)} required step="any" type="number" value={rejectedQty} /></label>
            <label className="text-sm font-medium">Rework<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min="0" onChange={(event) => setReworkQty(event.target.value)} required step="any" type="number" value={reworkQty} /></label>
            <label className="text-sm font-medium">Defect classification<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setDefectCode(event.target.value)} value={defectCode} /></label>
            <label className="text-sm font-medium">Notes<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
            <p className="text-xs text-slate-500 sm:col-span-2">Inspected must equal accepted + rejected + rework. Rework remains dispositioned and is not new production output.</p>
            <button className="rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2" disabled={submitting || loading} type="submit">{submitting ? "Posting…" : "Post inspection"}</button>
          </form> : null}
        </section> : null}

        {permissions.canReceive && permissions.canReadInventory ? <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Receive accepted finished goods</h2>
          <p className="mt-1 text-sm text-slate-500">Only unreceived accepted quantities from posted inspections can enter sellable finished-goods stock.</p>
          <form className="mt-4 space-y-3" onSubmit={submitReceipt}>
            <label className="block text-sm font-medium">Posted QC inspection<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setInspectionToReceive(event.target.value)} required value={inspectionToReceive}><option value="">Select accepted inspection</option>{receivableInspections.map((inspection) => <option key={inspection.id} value={inspection.id}>{inspection.number} · {inspection.manufacturingOrder.number} · accepted {inspection.acceptedQty}</option>)}</select></label>
            <label className="block text-sm font-medium">Finished goods warehouse<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setWarehouseId(event.target.value)} required value={warehouseId}><option value="">Select warehouse</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label className="block text-sm font-medium">Receipt number<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setReceiptNumber(event.target.value)} required value={receiptNumber} /></label>
            <label className="block text-sm font-medium">Accepted quantity to receive<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min="0.000001" onChange={(event) => setReceiptQty(event.target.value)} required step="any" type="number" value={receiptQty} /></label>
            <button className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={submitting || loading || receivableInspections.length === 0 || warehouses.length === 0} type="submit">{submitting ? "Posting…" : "Post finished goods receipt"}</button>
          </form>
        </section> : null}
      </div>

      {permissions.canInspect ? <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Inspection history</h2></div>{loading ? <p className="px-5 py-6 text-sm text-slate-500">Loading inspections…</p> : inspections.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">No QC inspections recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Inspection</th><th className="px-4 py-3">MO / Product</th><th className="px-4 py-3 text-right">Inspected</th><th className="px-4 py-3 text-right">Accepted</th><th className="px-4 py-3 text-right">Rejected</th><th className="px-4 py-3 text-right">Rework</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{inspections.map((inspection) => <tr key={inspection.id}><td className="px-5 py-3">{inspection.number}<span className="mt-1 block text-xs text-slate-500">{inspection.defectCode ?? "No defect code"}</span></td><td className="px-4 py-3">{inspection.manufacturingOrder.number} · {inspection.manufacturingOrder.item.sku}</td><td className="px-4 py-3 text-right">{inspection.inspectedQty}</td><td className="px-4 py-3 text-right">{inspection.acceptedQty}</td><td className="px-4 py-3 text-right">{inspection.rejectedQty}</td><td className="px-4 py-3 text-right">{inspection.reworkQty}</td><td className="px-5 py-3">{inspection.status}</td></tr>)}</tbody></table></div>}</section> : null}
    </div>
  );
}
