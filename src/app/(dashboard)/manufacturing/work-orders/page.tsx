"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate, formatQuantity } from "@/lib/format";

type WorkOrderRow = {
  id: string;
  number: string;
  sequence: number;
  operationCode: string;
  status: string;
  targetQuantity: string;
  completedQty: string;
  rejectedQty: string;
  standardMinutes: string;
  startedAt: string | null;
  completedAt: string | null;
  manufacturingOrder: {
    id: string;
    number: string;
    status: string;
    item: { sku: string; name: string };
  };
  workCenter: { id: string; code: string; name: string } | null;
  _count: { timeEntries: number };
};

type WorkCenter = {
  id: string;
  code: string;
  name: string;
  standardMinutes: string;
  hourlyRate: string;
};

const filters = ["SEMUA", "PENDING", "IN_PROGRESS", "PAUSED", "COMPLETED"] as const;
type Filter = (typeof filters)[number];

const filterLabels: Record<Filter, string> = {
  SEMUA: "Semua",
  PENDING: "Menunggu",
  IN_PROGRESS: "Diproses",
  PAUSED: "Dijeda",
  COMPLETED: "Selesai",
};

export default function WorkOrdersPage() {
  const [orders, setOrders] = useState<WorkOrderRow[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [filter, setFilter] = useState<Filter>("SEMUA");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [workCenterId, setWorkCenterId] = useState("");
  const [minutes, setMinutes] = useState("");
  const [completedQty, setCompletedQty] = useState("");
  const [rejectedQty, setRejectedQty] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [woRes, wcRes] = await Promise.all([
        fetch("/api/v1/manufacturing/work-orders?limit=100"),
        fetch("/api/v1/manufacturing/work-centers"),
      ]);
      if (!woRes.ok || !wcRes.ok) throw new Error("Gagal memuat pesanan kerja");
      const [woJson, wcJson] = await Promise.all([woRes.json(), wcRes.json()]);
      setOrders(woJson.data ?? []);
      setWorkCenters(wcJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pesanan kerja");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => (filter === "SEMUA" ? orders : orders.filter((order) => order.status === filter)),
    [orders, filter],
  );

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;

  function selectOrder(order: WorkOrderRow) {
    setSelectedId(order.id);
    setWorkCenterId(order.workCenter?.id ?? "");
    setMinutes("");
    setCompletedQty(order.completedQty === "0" ? order.targetQuantity : "");
    setRejectedQty("0");
  }

  async function postAction(endpoint: string, body?: unknown, successMessage?: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Aksi pesanan kerja gagal");
      if (successMessage) setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi pesanan kerja gagal");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignWorkCenter() {
    if (!selectedOrder || !workCenterId) return;
    await postAction(
      `/api/v1/manufacturing/work-orders/${selectedOrder.id}/work-center`,
      { workCenterId },
      "Work center ditetapkan.",
    );
  }

  async function handleStart() {
    if (!selectedOrder) return;
    await postAction(
      `/api/v1/manufacturing/work-orders/${selectedOrder.id}/start`,
      undefined,
      `${selectedOrder.number} dimulai.`,
    );
  }

  async function handlePause() {
    if (!selectedOrder) return;
    await postAction(
      `/api/v1/manufacturing/work-orders/${selectedOrder.id}/pause`,
      undefined,
      `${selectedOrder.number} dijeda.`,
    );
  }

  async function handleRecordTime(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    await postAction(
      `/api/v1/manufacturing/work-orders/${selectedOrder.id}/time-entries`,
      { minutes, idempotencyKey: crypto.randomUUID() },
      "Entri waktu dicatat.",
    );
    setMinutes("");
  }

  async function handleComplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    await postAction(
      `/api/v1/manufacturing/work-orders/${selectedOrder.id}/complete`,
      { completedQty, rejectedQty: rejectedQty || "0" },
      `${selectedOrder.number} diselesaikan.`,
    );
    setCompletedQty("");
    setRejectedQty("0");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi"
        title="Eksekusi pesanan kerja"
        description="Tetapkan work center, mulai/jeda pekerjaan, catat waktu aktual, dan selesaikan output."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              href="/manufacturing"
            >
              Pesanan produksi
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              href="/manufacturing/materials"
            >
              Material
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              href="/manufacturing/receipts"
            >
              Terima produksi
            </Link>
            <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
              Muat ulang
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {filters.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setFilter(entry)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              filter === entry
                ? "bg-brand-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {filterLabels[entry]}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Pesanan kerja" description={`${filtered.length} pesanan ditampilkan.`} />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat pesanan kerja…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="Belum ada pesanan kerja"
                description="Rilis pesanan produksi terlebih dahulu di halaman Produksi."
              />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>MO</Th>
                    <Th>Operasi</Th>
                    <Th>Work center</Th>
                    <Th>Status</Th>
                    <Th align="right">Target</Th>
                    <Th align="right">Selesai</Th>
                    <Th align="right">Reject</Th>
                    <Th align="right">Menit</Th>
                    <Th align="right">Aksi</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {filtered.map((order) => (
                    <Tr key={order.id} className={selectedId === order.id ? "bg-brand-50/60" : undefined}>
                      <Td className="tnum font-medium">{order.number}</Td>
                      <Td className="tnum text-slate-600">{order.manufacturingOrder.number}</Td>
                      <Td className="text-slate-600">{order.operationCode}</Td>
                      <Td className="tnum text-slate-600">{order.workCenter?.code ?? "—"}</Td>
                      <Td>{<StatusBadge status={order.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(order.targetQuantity)}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(order.completedQty)}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(order.rejectedQty)}</Td>
                      <Td align="right" className="tnum text-slate-600">{order._count.timeEntries}</Td>
                      <Td align="right">
                        <Button variant="secondary" size="sm" onClick={() => selectOrder(order)}>
                          Kelola
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Kelola pesanan kerja"
            description={selectedOrder ? `${selectedOrder.number} · ${selectedOrder.manufacturingOrder.item.sku}` : "Pilih pesanan kerja dari tabel."}
          />
          <CardBody className="space-y-5">
            {!selectedOrder ? (
              <EmptyState compact title="Belum ada pesanan dipilih" description="Klik Kelola pada salah satu pesanan kerja." />
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <dt className="text-slate-500">MO</dt>
                    <dd className="tnum font-medium text-slate-800">{selectedOrder.manufacturingOrder.number}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Status</dt>
                    <dd><StatusBadge status={selectedOrder.status} /></dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Barang</dt>
                    <dd className="text-slate-800">{selectedOrder.manufacturingOrder.item.name}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Target</dt>
                    <dd className="tnum text-slate-800">{formatQuantity(selectedOrder.targetQuantity)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Mulai</dt>
                    <dd className="tnum text-slate-800">{formatDate(selectedOrder.startedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Selesai</dt>
                    <dd className="tnum text-slate-800">{formatDate(selectedOrder.completedAt)}</dd>
                  </div>
                </dl>

                {selectedOrder.status === "PENDING" ? (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
                    <Field label="Work center" required hint="Wajib untuk mencatat waktu dan biaya tenaga kerja.">
                      <Select value={workCenterId} onChange={(event) => setWorkCenterId(event.target.value)}>
                        <option value="">Pilih work center</option>
                        {workCenters.map((center) => (
                          <option key={center.id} value={center.id}>
                            {center.code} — {center.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button variant="secondary" size="sm" onClick={() => { void handleAssignWorkCenter(); }} loading={saving} disabled={!workCenterId}>
                      Tetapkan work center
                    </Button>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status === "PENDING" || selectedOrder.status === "PAUSED" ? (
                    <Button variant="primary" size="sm" onClick={() => { void handleStart(); }} loading={saving}>
                      {selectedOrder.status === "PAUSED" ? "Lanjutkan" : "Mulai"}
                    </Button>
                  ) : null}
                  {selectedOrder.status === "IN_PROGRESS" ? (
                    <Button variant="secondary" size="sm" onClick={() => { void handlePause(); }} loading={saving}>
                      Jeda
                    </Button>
                  ) : null}
                </div>

                {selectedOrder.status === "IN_PROGRESS" ? (
                  <>
                    <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={handleRecordTime}>
                      <Field label="Catat waktu (menit)" required>
                        <Input
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          required
                          value={minutes}
                          onChange={(event) => setMinutes(event.target.value)}
                        />
                      </Field>
                      <Button type="submit" variant="secondary" size="sm" loading={saving}>
                        Simpan entri waktu
                      </Button>
                    </form>

                    <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={handleComplete}>
                      <Field label="Kuantitas selesai" required hint={`Sisa target ${formatQuantity(selectedOrder.targetQuantity)} dikurangi output tercatat.`}>
                        <Input
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          required
                          value={completedQty}
                          onChange={(event) => setCompletedQty(event.target.value)}
                        />
                      </Field>
                      <Field label="Kuantitas reject">
                        <Input
                          type="number"
                          min="0"
                          step="0.000001"
                          value={rejectedQty}
                          onChange={(event) => setRejectedQty(event.target.value)}
                        />
                      </Field>
                      <Button type="submit" variant="primary" size="sm" loading={saving}>
                        Selesaikan pesanan kerja
                      </Button>
                    </form>
                  </>
                ) : null}

                {selectedOrder.status === "COMPLETED" ? (
                  <Alert tone="success">Pesanan kerja ini sudah selesai. Output masuk ke antrean QC bila semua pesanan kerja MO selesai.</Alert>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
