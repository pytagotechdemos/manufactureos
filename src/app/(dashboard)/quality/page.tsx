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

type PendingOrder = {
  id: string;
  number: string;
  item: { sku: string; name: string };
  quantity: string;
  workOrders: { id: string; number: string; status: string; completedQty: string; rejectedQty: string }[];
};

type Inspection = {
  id: string;
  number: string;
  manufacturingOrder: { number: string };
  status: string;
  inspectedQty: string;
  acceptedQty: string;
  rejectedQty: string;
  reworkQty: string;
  inspectedAt: string | null;
};

export default function QualityPage() {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formNumber, setFormNumber] = useState("");
  const [formMoId, setFormMoId] = useState("");
  const [formWoId, setFormWoId] = useState("");
  const [formInspected, setFormInspected] = useState("");
  const [formAccepted, setFormAccepted] = useState("");
  const [formRejected, setFormRejected] = useState("");
  const [formRework, setFormRework] = useState("");
  const [formDefect, setFormDefect] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, inRes] = await Promise.all([
        fetch("/api/v1/quality/pending-orders"),
        fetch("/api/v1/quality/inspections"),
      ]);
      if (!poRes.ok || !inRes.ok) throw new Error("Failed to load quality data");
      const [poJson, inJson] = await Promise.all([poRes.json(), inRes.json()]);
      setPendingOrders(poJson.data ?? []);
      setInspections(inJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quality data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedMo = pendingOrders.find((mo) => mo.id === formMoId);
  const workOrders = selectedMo?.workOrders ?? [];

  async function handleCreateInspection(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const inspected = Number(formInspected || 0);
    const accepted = Number(formAccepted || 0);
    const rejected = Number(formRejected || 0);
    const rework = Number(formRework || 0);
    if (accepted + rejected + rework !== inspected) {
      setError("Accepted + rejected + rework must equal inspected quantity.");
      return;
    }
    try {
      const res = await fetch("/api/v1/quality/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: formNumber,
          manufacturingOrderId: formMoId,
          workOrderId: formWoId || undefined,
          inspectedQty: String(inspected),
          acceptedQty: String(accepted),
          rejectedQty: String(rejected),
          reworkQty: String(rework),
          defectCode: formDefect || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to create inspection");
      setNotice("Inspection recorded.");
      (event.currentTarget as HTMLFormElement).reset();
      setFormMoId("");
      setFormWoId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create inspection");
    }
  }

  async function handlePostInspection(event: React.FormEvent, id: string) {
    event.preventDefault();
    setError(null);
    try {
      const res = await fetch(`/api/v1/quality/inspections/${id}/post`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to post inspection");
      setNotice("Inspection posted to inventory.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post inspection");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality control"
        title="Quality Control"
        description="Inspect finished production before it reaches finished-goods stock."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            description="Pending production waiting for quality inspection."
            title="Pending Orders"
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading…</div>
            ) : pendingOrders.length === 0 ? (
              <EmptyState title="Nothing awaiting inspection" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>MO number</Th>
                    <Th>Item</Th>
                    <Th align="right">Produced</Th>
                    <Th align="right">Work orders</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {pendingOrders.map((mo) => (
                    <Tr key={mo.id}>
                      <Td className="font-medium tnum">{mo.number}</Td>
                      <Td className="text-slate-600 tnum">{mo.item.sku} — {mo.item.name}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(mo.quantity)}</Td>
                      <Td align="right" className="tnum text-slate-600">{mo.workOrders.length}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Create Inspection" />
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={handleCreateInspection}>
              <Field label="Inspection number" required>
                <Input name="number" placeholder="INS-2026-001" required value={formNumber} onChange={(e) => setFormNumber(e.target.value)} />
              </Field>
              <Field label="Manufacturing order" required>
                <Select name="manufacturingOrderId" required onChange={(e) => setFormMoId(e.target.value)} value={formMoId}>
                  <option value="">Select a pending MO</option>
                  {pendingOrders.map((mo) => (
                    <option key={mo.id} value={mo.id}>{mo.number} · {mo.item.sku}</option>
                  ))}
                </Select>
              </Field>
              {workOrders.length > 0 ? (
                <Field label="Work order">
                  <Select name="workOrderId" onChange={(e) => setFormWoId(e.target.value)} value={formWoId}>
                    <option value="">Select a work order (optional)</option>
                    {workOrders.map((wo) => (
                      <option key={wo.id} value={wo.id}>{wo.number}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Inspected qty" required>
                  <Input name="inspectedQty" type="number" step="0.000001" required value={formInspected} onChange={(e) => setFormInspected(e.target.value)} />
                </Field>
                <Field label="Accepted qty" required>
                  <Input name="acceptedQty" type="number" step="0.000001" required value={formAccepted} onChange={(e) => setFormAccepted(e.target.value)} />
                </Field>
                <Field label="Rejected qty" required>
                  <Input name="rejectedQty" type="number" step="0.000001" required value={formRejected} onChange={(e) => setFormRejected(e.target.value)} />
                </Field>
                <Field label="Rework qty" required>
                  <Input name="reworkQty" type="number" step="0.000001" required value={formRework} onChange={(e) => setFormRework(e.target.value)} />
                </Field>
              </div>
              <Field label="Defect code">
                <Input name="defectCode" placeholder="e.g. cracked panel" value={formDefect} onChange={(e) => setFormDefect(e.target.value)} />
              </Field>
              <Button type="submit" variant="primary">Record inspection</Button>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Inspection History" />
          <CardBody className="p-0">
            {inspections.length === 0 ? (
              <EmptyState title="No inspections yet" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Number</Th>
                    <Th>MO</Th>
                    <Th>Status</Th>
                    <Th align="right">Inspected</Th>
                    <Th align="right">Accepted</Th>
                    <Th align="right">Rejected</Th>
                    <Th align="right">Rework</Th>
                    <Th align="right">Inspected at</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {inspections.map((ins) => (
                    <Tr key={ins.id}>
                      <Td className="font-medium tnum">{ins.number}</Td>
                      <Td className="text-slate-600 tnum">{ins.manufacturingOrder.number}</Td>
                      <Td>{<StatusBadge status={ins.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(ins.inspectedQty)}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(ins.acceptedQty)}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(ins.rejectedQty)}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(ins.reworkQty)}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(ins.inspectedAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
