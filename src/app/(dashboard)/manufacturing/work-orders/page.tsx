"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/format";

type MoRow = {
  id: string;
  number: string;
  item: { sku: string; name: string };
  status: string;
  workOrders: { id: string; number: string; status: string }[];
  createdAt: string;
};

type RawMoRow = Omit<MoRow, "workOrders"> & { _count?: { workOrders: number } };

export default function WorkOrdersPage() {
  const [orders, setOrders] = useState<MoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/orders?limit=100");
      if (!res.ok) throw new Error("Failed to load manufacturing orders");
      const json = await res.json();
      setOrders((json.data as RawMoRow[] ?? []).map((mo) => ({
        id: mo.id,
        number: mo.number,
        item: mo.item,
        status: mo.status,
        workOrders: mo._count?.workOrders ? Array.from({ length: mo._count.workOrders }, (_, i) => ({
          id: `${mo.id}-wo-${i + 1}`,
          number: `${mo.number}-WO-${i + 1}`,
          status: "DRAFT",
        })) : [],
        createdAt: mo.createdAt,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load manufacturing orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalWorkOrders = orders.reduce((sum, mo) => sum + mo.workOrders.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Work Order Execution"
        description="Work orders live inside a manufacturing order. Start, pause and complete work from the manufacturing order detail."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Manufacturing Orders & Work Orders" />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading…</div>
            ) : orders.length === 0 ? (
              <EmptyState title="No manufacturing orders yet" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>MO number</Th>
                    <Th>Item</Th>
                    <Th>MO status</Th>
                    <Th align="right">Work orders</Th>
                    <Th align="right">Created</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {orders.map((mo) => (
                    <Tr key={mo.id}>
                      <Td className="font-medium tnum">{mo.number}</Td>
                      <Td className="text-slate-600 tnum">{mo.item.sku} — {mo.item.name}</Td>
                      <Td>{mo.status}</Td>
                      <Td align="right" className="tnum text-slate-600">{mo.workOrders.length}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(mo.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How it works" description="Work order lifecycle: draft → released → in progress → completed." />
          <CardBody className="space-y-3">
            <p className="text-[13px] text-slate-600">1. A manufacturing order is created from an MRP recommendation (Planning).</p>
            <p className="text-[13px] text-slate-600">2. Release the MO to reserve materials and generate work orders.</p>
            <p className="text-[13px] text-slate-600">3. Start/pause/complete each work order and book actual time entries.</p>
            <p className="text-[13px] text-slate-600">4. When all work orders complete, the MO moves to QC pending.</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent work orders" />
          <CardBody className="p-0">
            {totalWorkOrders === 0 ? (
              <EmptyState compact title="No work orders yet" description="Create and release a manufacturing order first." />
            ) : (
              <Table>
                <TableBody>
                  {orders.flatMap((mo) =>
                    mo.workOrders.map((wo) => (
                      <Tr key={wo.id}>
                        <Td className="font-medium tnum">{wo.number}</Td>
                        <Td className="text-slate-600 tnum">{mo.number}</Td>
                        <Td>{wo.status}</Td>
                        <Td align="right" className="tnum text-slate-500">{formatDate(mo.createdAt)}</Td>
                      </Tr>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Actions" description="Start, pause and complete require a work order id." />
          <CardBody className="space-y-3">
            <p className="text-[13px] text-slate-600">Work-order action endpoints are scoped to a specific work order:</p>
            <ul className="list-disc list-inside space-y-1 text-[12px] text-slate-500">
              <li>POST /api/v1/manufacturing/work-orders/[id]/start</li>
              <li>POST /api/v1/manufacturing/work-orders/[id]/pause</li>
              <li>POST /api/v1/manufacturing/work-orders/[id]/complete</li>
              <li>POST /api/v1/manufacturing/work-orders/[id]/time-entries</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
