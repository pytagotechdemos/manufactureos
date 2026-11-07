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
import { formatDate, formatQuantity } from "@/lib/format";

type MoRow = {
  id: string;
  number: string;
  item: { sku: string; name: string };
  quantity: string;
  status: string;
  warehouseId: string;
  wipWarehouseId: string;
  createdAt: string;
};

type Warehouse = { id: string; code: string; name: string; isWip: boolean };
type Item = { id: string; sku: string; name: string };

export default function ManufacturingPage() {
  const [orders, setOrders] = useState<MoRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [moRes, whRes, itemRes] = await Promise.all([
        fetch("/api/v1/manufacturing/orders?limit=100"),
        fetch("/api/v1/warehouses"),
        fetch("/api/v1/items?limit=100"),
      ]);
      if (!moRes.ok || !whRes.ok || !itemRes.ok) throw new Error("Failed to load manufacturing data");
      const [moJson, whJson, itemJson] = await Promise.all([moRes.json(), whRes.json(), itemRes.json()]);
      setOrders(moJson.data ?? []);
      setWarehouses(whJson.data ?? []);
      setItems(itemJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manufacturing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nonWip = warehouses.filter((w) => !w.isWip);
  const wip = warehouses.filter((w) => w.isWip);

  async function handleCreateMo(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice("Creating an MO requires an approved MRP recommendation. Run MRP in Planning first, then release the MO from the generated recommendation.");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Manufacturing"
        description="Manufacturing orders, work orders and production output."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="info" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Manufacturing Orders" />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading…</div>
            ) : orders.length === 0 ? (
              <EmptyState title="No manufacturing orders yet" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Number</Th>
                    <Th>Item</Th>
                    <Th align="right">Qty</Th>
                    <Th>Status</Th>
                    <Th align="right">Warehouse</Th>
                    <Th align="right">Created</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {orders.map((mo) => (
                    <Tr key={mo.id}>
                      <Td className="font-medium tnum">{mo.number}</Td>
                      <Td className="text-slate-600 tnum">{mo.item.sku} — {mo.item.name}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(mo.quantity)}</Td>
                      <Td>{<StatusBadge status={mo.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600 tnum">
                        {mo.warehouseId.slice(0, 8)}…
                      </Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(mo.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Create Manufacturing Order" description="Requires an MRP recommendation first." />
          <CardBody className="space-y-4">
            <Alert tone="info">
              Create MO is wired to the MRP recommendation flow. Select the item and quantity below — the recommendation linkage will be enabled once the Planning module generates a run.
            </Alert>
            <form className="space-y-4" onSubmit={handleCreateMo}>
              <Field label="Item" required>
                <Select name="itemId" required>
                  <option value="">Select item</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Planned quantity" required>
                <Input name="quantity" type="number" step="0.000001" required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Finished goods warehouse" required>
                  <Select name="warehouseId" required>
                    <option value="">Select warehouse</option>
                    {nonWip.map((w) => (
                      <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="WIP warehouse" required>
                  <Select name="wipWarehouseId" required>
                    <option value="">Select WIP warehouse</option>
                    {wip.map((w) => (
                      <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" variant="primary">Create manufacturing order</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
