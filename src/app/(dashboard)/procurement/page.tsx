"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";

type PurchaseOrder = {
  id: string;
  number: string;
  supplier: { code: string; name: string } | null;
  status: string;
  expectedDelivery: string | null;
  totalAmount: string;
  createdAt: string;
  lines: { id: string; item: { sku: string; name: string }; orderedQty: string; receivedQty: string }[];
  _count: { receipts: number };
};

type GoodsReceipt = {
  id: string;
  number: string;
  purchaseOrder: { number: string; supplier: { code: string; name: string } } | null;
  status: string;
  postedAt: string | null;
  createdAt: string;
};

type Supplier = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string; isWip: boolean };
type Item = { id: string; sku: string; name: string; baseUom: { code: string } | null };
type Uom = { id: string; code: string; name: string };
type PoLine = {
  id: string;
  sequence: number;
  orderedQty: string;
  receivedQty: string;
  item: { sku: string; name: string };
  purchaseOrder: { id: string; number: string; supplier: { code: string } };
};

export default function ProcurementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [poLines, setPoLines] = useState<PoLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, grRes, supRes, whRes, itemRes, uomRes, lineRes] = await Promise.all([
        fetch("/api/v1/procurement/purchase-orders?limit=100"),
        fetch("/api/v1/procurement/goods-receipts?limit=100"),
        fetch("/api/v1/suppliers"),
        fetch("/api/v1/warehouses"),
        fetch("/api/v1/items?limit=100"),
        fetch("/api/v1/uoms"),
        fetch("/api/v1/purchase-order-lines?limit=200"),
      ]);
      if (!poRes.ok) throw new Error("Failed to load purchase orders");
      if (!grRes.ok) throw new Error("Failed to load goods receipts");
      if (!supRes.ok) throw new Error("Failed to load suppliers");
      if (!whRes.ok) throw new Error("Failed to load warehouses");
      if (!itemRes.ok) throw new Error("Failed to load items");
      if (!uomRes.ok) throw new Error("Failed to load UOMs");
      if (!lineRes.ok) throw new Error("Failed to load PO lines");

      const [poJson, grJson, supJson, whJson, itemJson, uomJson, lineJson] = await Promise.all([
        poRes.json(), grRes.json(), supRes.json(), whRes.json(), itemRes.json(), uomRes.json(), lineRes.json(),
      ]);

      setPurchaseOrders((poJson.data as PurchaseOrder[] ?? []).map((po) => ({
        ...po,
        totalAmount: formatMoney(po.totalAmount),
      })));
      setGoodsReceipts(grJson.data ?? []);
      setSuppliers(supJson.data ?? []);
      setWarehouses((whJson.data ?? []).filter((w: Warehouse) => !w.isWip));
      setItems(itemJson.data ?? []);
      setUoms(uomJson.data ?? []);
      setPoLines(lineJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const outstandingLines = (poId: string) =>
    poLines.filter((line) => line.purchaseOrder.id === poId && Number(line.orderedQty) > Number(line.receivedQty));

  async function handleCreatePO(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const body = {
      number: form.get("number"),
      supplierId: form.get("supplierId"),
      warehouseId: form.get("warehouseId"),
      expectedDelivery: form.get("expectedDelivery") || undefined,
      lines: [
        {
          itemId: form.get("itemId"),
          quantity: form.get("quantity"),
          unitCost: form.get("unitCost"),
          uomId: form.get("uomId"),
        },
      ],
    };
    try {
      const res = await fetch("/api/v1/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to create purchase order");
      setNotice("Purchase order created.");
      (event.currentTarget as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create purchase order");
    }
  }

  async function handleCreateReceipt(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const body = {
      number: form.get("number"),
      purchaseOrderId: form.get("purchaseOrderId"),
      warehouseId: form.get("warehouseId"),
      idempotencyKey: form.get("idempotencyKey"),
      lines: [
        {
          purchaseOrderLineId: form.get("purchaseOrderLineId"),
          quantity: form.get("quantity"),
        },
      ],
    };
    try {
      const res = await fetch("/api/v1/procurement/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to post goods receipt");
      setNotice("Goods receipt posted.");
      (event.currentTarget as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post goods receipt");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Supply chain"
        title="Procurement"
        description="Purchase orders and goods receipts."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            actions={
              <div className="flex items-end gap-2">
                <Input
                  placeholder="Search PO number…"
                  className="w-[220px]"
                  value=""
                  onChange={() => {}}
                />
              </div>
            }
            description="Purchase orders and their line items."
            title="Purchase Orders"
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading…</div>
            ) : purchaseOrders.length === 0 ? (
              <EmptyState title="No purchase orders yet" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Number</Th>
                    <Th>Supplier</Th>
                    <Th>Status</Th>
                    <Th align="right">Expected</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Receipts</Th>
                    <Th align="right">Created</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <Tr key={po.id}>
                      <Td className="font-medium tnum">{po.number}</Td>
                      <Td className="text-slate-600 tnum">{po.supplier ? `${po.supplier.code} · ${po.supplier.name}` : "—"}</Td>
                      <Td>{<StatusBadge status={po.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600">
                        {formatDate(po.expectedDelivery)}
                      </Td>
                      <Td align="right" className="tnum text-slate-600">{po.totalAmount}</Td>
                      <Td align="right" className="tnum text-slate-600">{po._count.receipts}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(po.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Create Purchase Order" />
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={handleCreatePO}>
              <Field label="PO number" required>
                <Input name="number" placeholder="PO-2026-001" required />
              </Field>
              <Field label="Supplier" hint="Pick a registered supplier" required>
                <Select name="supplierId" required>
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Warehouse" hint="Destination warehouse" required>
                <Select name="warehouseId" required>
                  <option value="">Select warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Item" required>
                <Select name="itemId" required>
                  <option value="">Select item</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} — {it.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quantity" required>
                  <Input name="quantity" type="number" step="0.000001" required />
                </Field>
                <Field label="Unit cost" required>
                  <Input name="unitCost" type="number" step="0.0001" required />
                </Field>
                <Field label="UOM" required>
                  <Select name="uomId" required>
                    <option value="">Select UOM</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Expected delivery">
                  <Input name="expectedDelivery" type="datetime-local" />
                </Field>
              </div>
              <Button type="submit" variant="primary">Create purchase order</Button>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Goods Receipts" />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading…</div>
            ) : goodsReceipts.length === 0 ? (
              <EmptyState title="No goods receipts yet" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Number</Th>
                    <Th>Purchase Order</Th>
                    <Th>Supplier</Th>
                    <Th>Status</Th>
                    <Th align="right">Posted</Th>
                    <Th align="right">Created</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {goodsReceipts.map((gr) => (
                    <Tr key={gr.id}>
                      <Td className="font-medium tnum">{gr.number}</Td>
                      <Td className="text-slate-600 tnum">{gr.purchaseOrder?.number ?? "—"}</Td>
                      <Td className="text-slate-600 tnum">
                        {gr.purchaseOrder?.supplier ? `${gr.purchaseOrder.supplier.code}` : "—"}
                      </Td>
                      <Td>{<StatusBadge status={gr.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatDate(gr.postedAt)}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(gr.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Post Goods Receipt" />
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={handleCreateReceipt}>
              <Field label="Receipt number" required>
                <Input name="number" placeholder="GR-2026-001" required />
              </Field>
              <Field label="Purchase order" hint="Choose an approved PO" required>
                <Select name="purchaseOrderId" required>
                  <option value="">Select purchase order</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.number} · {po.supplier?.name ?? "—"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Warehouse" hint="Receipt warehouse" required>
                <Select name="warehouseId" required>
                  <option value="">Select warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Idempotency key" hint="Unique key so retries are safe" required>
                <Input name="idempotencyKey" placeholder="gr-2026-001-abc" required />
              </Field>
              <Field label="PO line" hint="Only outstanding lines can be received" required>
                <Select name="purchaseOrderLineId" required>
                  <option value="">Select a PO line</option>
                  {poLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      PO {line.purchaseOrder.number} · line {line.sequence} · {line.item.sku}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Received quantity" required>
                <Input name="quantity" type="number" step="0.000001" required />
              </Field>
              <Button type="submit" variant="primary">Post goods receipt</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
