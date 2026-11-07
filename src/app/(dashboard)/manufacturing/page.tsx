"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  sourceRecommendationId: string | null;
  createdAt: string;
};

type Warehouse = { id: string; code: string; name: string; isWip: boolean };

type MrpRun = {
  id: string;
  runNumber: string;
  status: string;
  createdAt: string;
  _count: { buckets: number; recommendations: number };
};

type Recommendation = {
  id: string;
  itemId: string;
  supplyType: string;
  quantity: string;
  requiredDate: string;
  plannedReleaseDate: string;
  late: boolean;
  item: { sku: string; name: string; baseUom: { code: string } | null };
};

type MrpRunDetail = MrpRun & { recommendations: Recommendation[] };

export default function ManufacturingPage() {
  const [orders, setOrders] = useState<MoRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [runs, setRuns] = useState<MrpRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [runDetail, setRunDetail] = useState<MrpRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formNumber, setFormNumber] = useState("");
  const [formRecommendationId, setFormRecommendationId] = useState("");
  const [formWarehouseId, setFormWarehouseId] = useState("");
  const [formWipWarehouseId, setFormWipWarehouseId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [moRes, whRes, runRes] = await Promise.all([
        fetch("/api/v1/manufacturing/orders?limit=100"),
        fetch("/api/v1/warehouses"),
        fetch("/api/v1/planning/mrp-runs"),
      ]);
      if (!moRes.ok || !whRes.ok || !runRes.ok) throw new Error("Gagal memuat data produksi");
      const [moJson, whJson, runJson] = await Promise.all([moRes.json(), whRes.json(), runRes.json()]);
      setOrders(moJson.data ?? []);
      setWarehouses(whJson.data ?? []);
      const runRows = (runJson.data ?? []) as MrpRun[];
      setRuns(runRows);
      setSelectedRunId((current) => (current || runRows[0]?.id || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data produksi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      return;
    }
    let cancelled = false;
    setRunLoading(true);
    fetch(`/api/v1/planning/mrp-runs/${selectedRunId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat rekomendasi MRP");
        if (!cancelled) setRunDetail(json.data ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat rekomendasi MRP");
      })
      .finally(() => {
        if (!cancelled) setRunLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  const usedRecommendationIds = useMemo(
    () => new Set(orders.map((order) => order.sourceRecommendationId).filter((id): id is string => Boolean(id))),
    [orders],
  );

  const makeRecommendations = useMemo(
    () =>
      (runDetail?.recommendations ?? []).filter(
        (recommendation) => recommendation.supplyType === "MAKE" && !usedRecommendationIds.has(recommendation.id),
      ),
    [runDetail, usedRecommendationIds],
  );

  const selectedRecommendation = makeRecommendations.find((entry) => entry.id === formRecommendationId);

  const nonWip = warehouses.filter((warehouse) => !warehouse.isWip);
  const wip = warehouses.filter((warehouse) => warehouse.isWip);

  function suggestNumber() {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `MO-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  async function handleCreateMo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: formNumber || suggestNumber(),
          recommendationId: formRecommendationId,
          warehouseId: formWarehouseId,
          wipWarehouseId: formWipWarehouseId,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membuat pesanan produksi");
      setNotice(`Pesanan produksi ${json?.data?.number ?? ""} berhasil dibuat.`);
      setFormNumber("");
      setFormRecommendationId("");
      setFormWarehouseId("");
      setFormWipWarehouseId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pesanan produksi");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(order: MoRow, action: "plan" | "release") {
    setActingId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manufacturing/orders/${order.id}/${action}`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Aksi pesanan produksi gagal");
      setNotice(action === "plan" ? `${order.number} direncanakan.` : `${order.number} dirilis dan bahan dipesan.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi pesanan produksi gagal");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi"
        title="Produksi"
        description="Pesanan produksi dibuat dari rekomendasi MRP, lalu direncanakan dan dirilis ke lantai produksi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              href="/manufacturing/materials"
            >
              Material
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              href="/manufacturing/work-orders"
            >
              Pesanan kerja
            </Link>
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              href="/manufacturing/receipts"
            >
              Terima produksi
            </Link>
          </div>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Pesanan produksi"
            description={`${orders.length} pesanan terdaftar.`}
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat pesanan produksi…</div>
            ) : orders.length === 0 ? (
              <EmptyState
                title="Belum ada pesanan produksi"
                description="Jalankan MRP di Perencanaan, lalu buat MO dari rekomendasi MAKE."
              />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Barang</Th>
                    <Th align="right">Kuantitas</Th>
                    <Th>Status</Th>
                    <Th align="right">Dibuat</Th>
                    <Th align="right">Aksi</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {orders.map((order) => (
                    <Tr key={order.id}>
                      <Td className="tnum font-medium">{order.number}</Td>
                      <Td className="text-slate-600">
                        {order.item.sku} — {order.item.name}
                      </Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(order.quantity)}</Td>
                      <Td>{<StatusBadge status={order.status} />}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(order.createdAt)}</Td>
                      <Td align="right">
                        {order.status === "DRAFT" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={actingId === order.id}
                            onClick={() => { void handleAction(order, "plan"); }}
                          >
                            Rencanakan
                          </Button>
                        ) : order.status === "PLANNED" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={actingId === order.id}
                            onClick={() => { void handleAction(order, "release"); }}
                          >
                            Rilis
                          </Button>
                        ) : (
                          <span className="text-[12px] text-slate-400">—</span>
                        )}
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
            title="Buat dari rekomendasi MRP"
            description="Hanya rekomendasi MAKE yang belum memiliki MO."
          />
          <CardBody>
            <form className="space-y-4" onSubmit={handleCreateMo}>
              <Field label="Run MRP">
                <Select value={selectedRunId} onChange={(event) => setSelectedRunId(event.target.value)}>
                  <option value="">Pilih run MRP</option>
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.runNumber} · {formatDate(run.createdAt)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nomor MO" required hint="Kosongkan untuk nomor otomatis.">
                <Input placeholder={suggestNumber()} value={formNumber} onChange={(event) => setFormNumber(event.target.value)} />
              </Field>
              <Field
                label="Rekomendasi"
                required
                hint={
                  runLoading
                    ? "Memuat rekomendasi…"
                    : makeRecommendations.length === 0
                      ? "Tidak ada rekomendasi MAKE yang belum dipakai."
                      : undefined
                }
              >
                <Select
                  required
                  value={formRecommendationId}
                  onChange={(event) => setFormRecommendationId(event.target.value)}
                >
                  <option value="">Pilih rekomendasi</option>
                  {makeRecommendations.map((recommendation) => (
                    <option key={recommendation.id} value={recommendation.id}>
                      {recommendation.item.sku} · {recommendation.quantity} {recommendation.item.baseUom?.code ?? ""} ·{" "}
                      {formatDate(recommendation.requiredDate)}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedRecommendation ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-600">
                  <p className="font-medium text-slate-800">{selectedRecommendation.item.name}</p>
                  <p className="mt-1">
                    Kuantitas {formatQuantity(selectedRecommendation.quantity)} · dibutuhkan {formatDate(selectedRecommendation.requiredDate)}
                    {selectedRecommendation.late ? " · terlambat" : ""}
                  </p>
                </div>
              ) : null}
              <Field label="Gudang sumber bahan" required>
                <Select required value={formWarehouseId} onChange={(event) => setFormWarehouseId(event.target.value)}>
                  <option value="">Pilih gudang</option>
                  {nonWip.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Gudang WIP" required>
                <Select required value={formWipWarehouseId} onChange={(event) => setFormWipWarehouseId(event.target.value)}>
                  <option value="">Pilih gudang WIP</option>
                  {wip.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="primary" loading={saving} disabled={makeRecommendations.length === 0}>
                {saving ? "Membuat…" : "Buat pesanan produksi"}
              </Button>
              <p className="text-[12px] text-slate-500">
                Belum ada run MRP?{" "}
                <Link className="font-medium text-brand-700 hover:underline" href="/planning">
                  Jalankan di Perencanaan
                </Link>
                .
              </p>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
