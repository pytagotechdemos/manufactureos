"use client";

import { useCallback, useEffect, useState } from "react";

type Permissions = { canReceive: boolean; canIssue: boolean; canReserve: boolean; canTransfer: boolean; canAdjust: boolean };
type Item = { id: string; sku: string; name: string; baseUom: { code: string } };
type Warehouse = { id: string; code: string; name: string };
type Balance = { id: string; itemId: string; warehouseId: string; onHand: string; reserved: string; blocked: string; available: string; item: Item; warehouse: Warehouse };
type Movement = { id: string; movementType: string; quantity: string; sourceType: string; sourceId: string; postedAt: string; item: { sku: string; name: string }; warehouse: { code: string; name: string } };
type Reservation = { id: string; quantity: string; status: string; sourceType: string; sourceId: string; item: { sku: string; name: string }; warehouse: { code: string; name: string } };
type MasterData = { items: Item[]; warehouses: Warehouse[] };
type Action = "RECEIPT" | "ISSUE" | "TRANSFER" | "ADJUST_IN" | "ADJUST_OUT" | "BLOCK" | "UNBLOCK" | "RESERVE";

const actions: { id: Action; label: string; permission: keyof Permissions }[] = [
  { id: "RECEIPT", label: "Receive", permission: "canReceive" },
  { id: "ISSUE", label: "Issue", permission: "canIssue" },
  { id: "TRANSFER", label: "Transfer", permission: "canTransfer" },
  { id: "ADJUST_IN", label: "Adjust +", permission: "canAdjust" },
  { id: "ADJUST_OUT", label: "Adjust −", permission: "canAdjust" },
  { id: "BLOCK", label: "Block stock", permission: "canAdjust" },
  { id: "UNBLOCK", label: "Unblock stock", permission: "canAdjust" },
  { id: "RESERVE", label: "Reserve", permission: "canReserve" },
];

async function requestJson<T>(response: Response): Promise<T> {
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Request failed");
  return result;
}

export function InventoryScreen({ permissions }: { permissions: Permissions }) {
  const [masterData, setMasterData] = useState<MasterData>({ items: [], warehouses: [] });
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [action, setAction] = useState<Action>("RECEIPT");
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const permittedActions = actions.filter((entry) => permissions[entry.permission]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [master, balanceResult, movementResult, reservationResult] = await Promise.all([
        fetch("/api/v1/inventory/master-data", { cache: "no-store" }).then(requestJson<{ data: MasterData }>),
        fetch("/api/v1/inventory/balances", { cache: "no-store" }).then(requestJson<{ data: Balance[] }>),
        fetch("/api/v1/inventory/movements?limit=50", { cache: "no-store" }).then(requestJson<{ data: Movement[] }>),
        fetch("/api/v1/inventory/reservations?status=ACTIVE", { cache: "no-store" }).then(requestJson<{ data: Reservation[] }>),
      ]);
      setMasterData(master.data);
      setBalances(balanceResult.data);
      setMovements(movementResult.data);
      setReservations(reservationResult.data);
      if (!itemId && master.data.items[0]) setItemId(master.data.items[0].id);
      if (!warehouseId && master.data.warehouses[0]) setWarehouseId(master.data.warehouses[0].id);
      if (!destinationWarehouseId && master.data.warehouses[1]) setDestinationWarehouseId(master.data.warehouses[1].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load inventory data");
    } finally {
      setLoading(false);
    }
  }, [destinationWarehouseId, itemId, warehouseId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!permittedActions.some((entry) => entry.id === action) && permittedActions[0]) setAction(permittedActions[0].id); }, [action, permittedActions]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemId || !warehouseId) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    const idempotencyKey = crypto.randomUUID();
    const base = { itemId, quantity, sourceType, sourceId, idempotencyKey };
    let endpoint = "";
    let payload: Record<string, string>;
    if (action === "TRANSFER") {
      endpoint = "/api/v1/inventory/transfers";
      payload = { itemId, fromWarehouseId: warehouseId, toWarehouseId: destinationWarehouseId, quantity, sourceType, sourceId, idempotencyKey };
    } else if (action === "ADJUST_IN" || action === "ADJUST_OUT") {
      endpoint = "/api/v1/inventory/adjustments";
      payload = { ...base, warehouseId, direction: action === "ADJUST_IN" ? "INCREASE" : "DECREASE" };
    } else if (action === "BLOCK" || action === "UNBLOCK") {
      endpoint = "/api/v1/inventory/blocked-stock";
      payload = { ...base, warehouseId, action };
    } else if (action === "RESERVE") {
      endpoint = "/api/v1/inventory/reservations";
      payload = { ...base, warehouseId };
    } else {
      endpoint = action === "RECEIPT" ? "/api/v1/inventory/receipts" : "/api/v1/inventory/issues";
      payload = { ...base, warehouseId };
    }
    try {
      await requestJson(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setNotice(`${actions.find((entry) => entry.id === action)?.label ?? "Inventory action"} posted successfully.`);
      setQuantity("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inventory posting failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function release(id: string) {
    setError(null);
    setNotice(null);
    try {
      await requestJson(await fetch(`/api/v1/inventory/reservations/${id}/release`, { method: "POST" }));
      setNotice("Reservation released.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reservation release failed");
    }
  }

  const visibleBalances = balances.filter((balance) => `${balance.item.sku} ${balance.item.name} ${balance.warehouse.code}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-blue-700">Warehouse</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="mt-2 text-sm text-slate-600">Balances, reservations, posted movements, and controlled stock transactions.</p>
      </header>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</div> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Stock balances</h2>
            <div className="flex gap-2"><input aria-label="Search inventory balances" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Search item or warehouse" value={search} /><button className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => void refresh()} type="button">Refresh</button></div>
          </div>
          {loading ? <p className="px-5 py-8 text-sm text-slate-500">Loading balances…</p> : visibleBalances.length === 0 ? <p className="px-5 py-8 text-sm text-slate-500">No stock balances found. Receipts will create balance records.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Item</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reserved</th><th className="px-4 py-3 text-right">Blocked</th><th className="px-5 py-3 text-right">Available</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleBalances.map((balance) => <tr key={balance.id}><td className="px-5 py-3"><p className="font-medium">{balance.item.sku}</p><p className="text-xs text-slate-500">{balance.item.name}</p></td><td className="px-4 py-3">{balance.warehouse.code}</td><td className="px-4 py-3 text-right">{balance.onHand} {balance.item.baseUom.code}</td><td className="px-4 py-3 text-right">{balance.reserved}</td><td className="px-4 py-3 text-right">{balance.blocked}</td><td className="px-5 py-3 text-right font-semibold">{balance.available}</td></tr>)}</tbody></table></div>}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Post inventory transaction</h2>
          {permittedActions.length === 0 ? <p className="mt-4 text-sm text-slate-600">You do not have posting permissions.</p> : <form className="mt-4 space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium">Transaction<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setAction(event.target.value as Action)} value={action}>{permittedActions.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            <label className="block text-sm font-medium">Item<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setItemId(event.target.value)} required value={itemId}><option value="">Select item</option>{masterData.items.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label>
            <label className="block text-sm font-medium">{action === "TRANSFER" ? "From warehouse" : "Warehouse"}<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setWarehouseId(event.target.value)} required value={warehouseId}><option value="">Select warehouse</option>{masterData.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            {action === "TRANSFER" ? <label className="block text-sm font-medium">To warehouse<select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setDestinationWarehouseId(event.target.value)} required value={destinationWarehouseId}><option value="">Select warehouse</option>{masterData.warehouses.filter((warehouse) => warehouse.id !== warehouseId).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label> : null}
            <label className="block text-sm font-medium">Quantity<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min="0.000001" onChange={(event) => setQuantity(event.target.value)} required step="any" type="number" value={quantity} /></label>
            <label className="block text-sm font-medium">Source type<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setSourceType(event.target.value)} placeholder="e.g. CYCLE_COUNT" required value={sourceType} /></label>
            <label className="block text-sm font-medium">Source reference<input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setSourceId(event.target.value)} placeholder="Document number or reference" required value={sourceId} /></label>
            <button className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={submitting || loading || masterData.items.length === 0 || masterData.warehouses.length === 0} type="submit">{submitting ? "Posting…" : "Post transaction"}</button>
            <p className="text-xs leading-5 text-slate-500">Posting is audited and idempotent. Availability is revalidated server-side at commit.</p>
          </form>}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Active reservations</h2></div>
        {reservations.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">No active reservations.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Item</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Source</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{reservations.map((reservation) => <tr key={reservation.id}><td className="px-5 py-3">{reservation.item.sku} · {reservation.item.name}</td><td className="px-4 py-3">{reservation.warehouse.code}</td><td className="px-4 py-3">{reservation.sourceType} / {reservation.sourceId}</td><td className="px-4 py-3 text-right">{reservation.quantity}</td><td className="px-5 py-3 text-right">{permissions.canReserve ? <button className="text-sm font-medium text-blue-700 hover:underline" onClick={() => void release(reservation.id)} type="button">Release</button> : null}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Recent stock movements</h2></div>
        {movements.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">No posted stock movements.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Posted</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Source</th><th className="px-5 py-3 text-right">Quantity</th></tr></thead><tbody className="divide-y divide-slate-100">{movements.map((movement) => <tr key={movement.id}><td className="whitespace-nowrap px-5 py-3">{new Date(movement.postedAt).toLocaleString("en-ID", { timeZone: "Asia/Jakarta" })}</td><td className="px-4 py-3">{movement.item.sku} · {movement.item.name}</td><td className="px-4 py-3">{movement.warehouse.code}</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-1 text-xs">{movement.movementType}</span></td><td className="px-4 py-3">{movement.sourceType} / {movement.sourceId}</td><td className="px-5 py-3 text-right font-medium">{movement.quantity}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
