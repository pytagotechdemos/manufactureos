"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";
import { ManufacturingNav } from "@/components/manufacturing/manufacturing-nav";
import { formatDate, formatQuantity } from "@/lib/format";

type MoSummary = {
  id: string;
  number: string;
  status: string;
  quantity: string;
  item: { sku: string; name: string };
};

type MoMaterial = {
  id: string;
  sequence: number;
  itemId: string;
  plannedQty: string;
  issuedQty: string;
  consumedQty: string;
  returnedQty: string;
  uomCode: string;
  item: { id: string; sku: string; name: string; baseUom: { code: string } | null };
};

type MoDetail = {
  id: string;
  number: string;
  status: string;
  quantity: string;
  producedQuantity: string;
  item: { sku: string; name: string; baseUom: { code: string } | null };
  warehouse: { code: string; name: string };
  wipWarehouse: { code: string; name: string };
  createdAt: string;
  materials: MoMaterial[];
  workOrders: Array<{ id: string; number: string; status: string }>;
};

const ACTIVE_STATUSES = ["RELEASED", "IN_PROGRESS", "QC_PENDING"];

function remainingIssue(material: MoMaterial): Decimal {
  const diff = new Decimal(material.plannedQty).minus(material.issuedQty);
  return diff.isPositive() ? diff : new Decimal(0);
}

function remainingWip(material: MoMaterial): Decimal {
  const diff = new Decimal(material.issuedQty)
    .minus(material.consumedQty)
    .minus(material.returnedQty);
  return diff.isPositive() ? diff : new Decimal(0);
}

export default function MaterialsPage() {
  const [orders, setOrders] = useState<MoSummary[]>([]);
  const [selectedMoId, setSelectedMoId] = useState("");
  const [detail, setDetail] = useState<MoDetail | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode | null>(null);

  const [issueQty, setIssueQty] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [returnQty, setReturnQty] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/orders?limit=100&offset=0");
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat pesanan produksi");
      const total = Number(json.page?.total ?? json.data?.length ?? 0);
      const offsets = Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, index) => (index + 1) * 100);
      const pages: Array<{ data?: MoSummary[] }> = [];
      for (let index = 0; index < offsets.length; index += 10) {
        pages.push(...await Promise.all(offsets.slice(index, index + 10).map(async (offset) => {
          const response = await fetch(`/api/v1/manufacturing/orders?limit=100&offset=${offset}`);
          if (!response.ok) throw new Error("Gagal memuat seluruh pesanan produksi");
          return response.json();
        })));
      }
      const rows = [...(json.data ?? []), ...pages.flatMap((page) => page.data ?? [])] as MoSummary[];
      setOrders(rows);
      setSelectedMoId((current) => {
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const orderIdParam = params.get("orderId");
          const moParam = params.get("mo");
          if (orderIdParam && rows.some((row) => row.id === orderIdParam)) return orderIdParam;
          if (moParam && rows.some((row) => row.number.toLowerCase() === moParam.toLowerCase())) {
            return rows.find((row) => row.number.toLowerCase() === moParam.toLowerCase())!.id;
          }
        }
        if (current && rows.some((row) => row.id === current)) return current;
        return rows.find((row) => ACTIVE_STATUSES.includes(row.status))?.id ?? rows[0]?.id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pesanan produksi");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (orderId: string) => {
    if (!orderId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manufacturing/orders/${orderId}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat material pesanan");
      setDetail(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat material pesanan");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadDetail(selectedMoId);
    setSelectedMaterialId("");
  }, [selectedMoId, loadDetail]);

  const selectedMaterial = detail?.materials.find((material) => material.id === selectedMaterialId) ?? null;
  const canIssue = detail ? detail.status === "RELEASED" || detail.status === "IN_PROGRESS" : false;
  const canDispose = detail ? ACTIVE_STATUSES.includes(detail.status) : false;

  function exportMaterialsCsv() {
    if (!detail || detail.materials.length === 0) return;
    const headers = [
      "No",
      "SKU Bahan",
      "Nama Bahan",
      "Satuan",
      "Rencana",
      "Terbit",
      "Konsumsi",
      "Kembali",
      "Sisa WIP",
      "Nomor MO",
    ];
    const rows = detail.materials.map((m) => [
      m.sequence,
      m.item.sku,
      m.item.name,
      m.uomCode,
      m.plannedQty,
      m.issuedQty,
      m.consumedQty,
      m.returnedQty,
      remainingWip(m).toString(),
      detail.number,
    ]);
    downloadCsv(`material-mo-${detail.number}.csv`, headers, rows);
  }

  function selectMaterial(material: MoMaterial) {
    setSelectedMaterialId(material.id);
    const remIssue = remainingIssue(material);
    setIssueQty(remIssue.greaterThan(0) ? remIssue.toString() : "");
    const wip = remainingWip(material);
    setConsumeQty(wip.greaterThan(0) ? wip.toString() : "");
    setReturnQty("");
  }

  async function postAction(
    materialId: string,
    action: "issue" | "consume" | "return",
    quantity: string,
    successMessage: React.ReactNode,
  ) {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manufacturing/orders/${detail.id}/materials/${materialId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, idempotencyKey: crypto.randomUUID() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Aksi material gagal diproses");
      setNotice(successMessage);
      setIssueQty("");
      setConsumeQty("");
      setReturnQty("");
      setSelectedMaterialId("");
      await loadDetail(detail.id);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi material gagal diproses");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Shop Floor & Manufacturing"
        title="Material MO & Work In Progress (WIP)"
        description="Terbitkan komponen dari gudang ke WIP, catat konsumsi aktual, dan proses pengembalian sisa material."
        actions={
          <Button variant="secondary" onClick={() => { void loadOrders(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      <ManufacturingNav />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Bahan pesanan"
            description="Menerbitkan bahan memindahkan stok dari gudang sumber ke gudang WIP."
            actions={
              detail && detail.materials.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={exportMaterialsCsv}>
                  Ekspor CSV
                </Button>
              ) : undefined
            }
          />
          <CardBody className="space-y-4">
            <Field label="Pilih Manufacturing Order (MO)" required>
              <Select required value={selectedMoId} onChange={(event) => setSelectedMoId(event.target.value)}>
                <option value="">Pilih Manufacturing Order (MO)</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.number} · {order.item.sku} · {order.status}
                  </option>
                ))}
              </Select>
            </Field>

            {loading || detailLoading ? (
              <div className="rounded-md border border-slate-200 p-8 text-center text-slate-500">
                Memuat material…
              </div>
            ) : !detail ? (
              <EmptyState compact title="Belum ada MO dipilih" description="Pilih Manufacturing Order (MO) di atas." />
            ) : detail.materials.length === 0 ? (
              <EmptyState
                compact
                title="Pesanan ini tidak memiliki material"
                description="Material dibuat saat pesanan produksi dibuat dari rekomendasi MRP."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                  <StatusBadge status={detail.status} />
                  <span className="tnum">{detail.item.sku} — {detail.item.name}</span>
                  <span>·</span>
                  <span>Gudang sumber {detail.warehouse.code}</span>
                  <span>·</span>
                  <span>WIP {detail.wipWarehouse.code}</span>
                  <span>·</span>
                  <span className="tnum">Dibuat {formatDate(detail.createdAt)}</span>
                </div>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th className="w-[40px]">#</Th>
                      <Th>Komponen / Bahan</Th>
                      <Th align="right" className="w-[90px]">Planned</Th>
                      <Th align="right" className="w-[90px]">Issued</Th>
                      <Th align="right" className="w-[90px]">Consumed</Th>
                      <Th align="right" className="w-[90px]">Returned</Th>
                      <Th align="right" className="w-[100px]">Sisa WIP</Th>
                      <Th align="right" className="w-[90px]">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {detail.materials.map((material) => (
                      <Tr key={material.id} className={selectedMaterialId === material.id ? "bg-brand-50/60" : undefined}>
                        <Td className="font-mono text-xs text-slate-400">{material.sequence}</Td>
                        <Td>
                          <span className="font-mono text-xs font-semibold text-brand-600">{material.item.sku}</span>
                          <span className="ml-2 text-slate-800 text-xs font-medium">{material.item.name}</span>
                        </Td>
                        <Td align="right" className="tnum text-slate-700 text-xs whitespace-nowrap">{formatQuantity(material.plannedQty)}</Td>
                        <Td align="right" className="tnum text-blue-700 font-medium text-xs whitespace-nowrap">{formatQuantity(material.issuedQty)}</Td>
                        <Td align="right" className="tnum text-emerald-700 font-medium text-xs whitespace-nowrap">{formatQuantity(material.consumedQty)}</Td>
                        <Td align="right" className="tnum text-amber-700 text-xs whitespace-nowrap">{formatQuantity(material.returnedQty)}</Td>
                        <Td align="right" className="tnum font-semibold text-brand-700 text-xs whitespace-nowrap">{formatQuantity(remainingWip(material).toString())}</Td>
                        <Td align="right" className="whitespace-nowrap">
                          <Button variant="secondary" size="sm" onClick={() => selectMaterial(material)}>
                            Kelola
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-[12px] text-slate-500">
                  Produksi aktual baru terhitung setelah konsumsi bahan dan entri waktu tercatat. Total {detail.materials.length} baris material.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Kelola material"
            description={
              selectedMaterial
                ? `${selectedMaterial.item.sku} · sisa WIP ${formatQuantity(remainingWip(selectedMaterial).toString())} ${selectedMaterial.uomCode}`
                : "Pilih baris material dari tabel."
            }
          />
          <CardBody className="space-y-5">
            {!detail || !selectedMaterial ? (
              <EmptyState compact title="Belum ada material dipilih" description="Klik Kelola pada salah satu baris bahan." />
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <dt className="text-slate-500">Rencana</dt>
                    <dd className="tnum text-slate-800">{formatQuantity(selectedMaterial.plannedQty)} {selectedMaterial.uomCode}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Sudah terbit</dt>
                    <dd className="tnum text-slate-800">{formatQuantity(selectedMaterial.issuedQty)} {selectedMaterial.uomCode}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Dikonsumsi</dt>
                    <dd className="tnum text-slate-800">{formatQuantity(selectedMaterial.consumedQty)} {selectedMaterial.uomCode}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Dikembalikan</dt>
                    <dd className="tnum text-slate-800">{formatQuantity(selectedMaterial.returnedQty)} {selectedMaterial.uomCode}</dd>
                  </div>
                </dl>

                <form
                  className="space-y-3 border-t border-slate-200 pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void postAction(
                      selectedMaterial.id,
                      "issue",
                      issueQty,
                      <span>
                        Bahan {selectedMaterial.item.sku} diterbitkan {issueQty} {selectedMaterial.uomCode}.{" "}
                        <Link
                          href={`/manufacturing/work-orders?mo=${detail.number}`}
                          className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
                        >
                          Buka Work Orders ({detail.number}) &rarr;
                        </Link>
                      </span>,
                    );
                  }}
                >
                  <Field
                    label="Terbitkan bahan"
                    required
                    hint={`Sisa yang belum diterbitkan ${formatQuantity(remainingIssue(selectedMaterial).toString())} ${selectedMaterial.uomCode}.`}
                  >
                    <Input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      max={remainingIssue(selectedMaterial).toString()}
                      required
                      value={issueQty}
                      onChange={(event) => setIssueQty(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    loading={saving}
                    disabled={!canIssue || remainingIssue(selectedMaterial).lessThanOrEqualTo(0)}
                  >
                    Terbitkan ke WIP
                  </Button>
                  {!canIssue ? (
                    <p className="text-[12px] text-slate-500">Penerbitan bahan tersedia pada status RELEASED atau IN_PROGRESS.</p>
                  ) : null}
                </form>

                <form
                  className="space-y-3 border-t border-slate-200 pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void postAction(
                      selectedMaterial.id,
                      "consume",
                      consumeQty,
                      <span>
                        Konsumsi {selectedMaterial.item.sku} {consumeQty} {selectedMaterial.uomCode} dicatat.{" "}
                        <Link
                          href={`/reports?mo=${detail.number}`}
                          className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
                        >
                          Lihat Biaya Aktual ({detail.number}) &rarr;
                        </Link>
                      </span>,
                    );
                  }}
                >
                  <Field
                    label="Catat konsumsi"
                    required
                    hint={`Maksimal ${formatQuantity(remainingWip(selectedMaterial).toString())} ${selectedMaterial.uomCode}.`}
                  >
                    <Input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      max={remainingWip(selectedMaterial).toString()}
                      required
                      value={consumeQty}
                      onChange={(event) => setConsumeQty(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={saving}
                    disabled={!canDispose || remainingWip(selectedMaterial).lessThanOrEqualTo(0)}
                  >
                    Simpan konsumsi
                  </Button>
                </form>

                <form
                  className="space-y-3 border-t border-slate-200 pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void postAction(
                      selectedMaterial.id,
                      "return",
                      returnQty,
                      `Sisa ${selectedMaterial.item.sku} ${returnQty} ${selectedMaterial.uomCode} dikembalikan dari WIP.`,
                    );
                  }}
                >
                  <Field
                    label="Kembalikan sisa"
                    required
                    hint={`Maksimal ${formatQuantity(remainingWip(selectedMaterial).toString())} ${selectedMaterial.uomCode}.`}
                  >
                    <Input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      max={remainingWip(selectedMaterial).toString()}
                      required
                      value={returnQty}
                      onChange={(event) => setReturnQty(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    loading={saving}
                    disabled={!canDispose || remainingWip(selectedMaterial).lessThanOrEqualTo(0)}
                  >
                    Kembalikan ke gudang
                  </Button>
                </form>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {detail && detail.materials.length > 0 && !canIssue ? (
        <Alert tone="info">
          {detail.status === "DRAFT" || detail.status === "PLANNED"
            ? "Pesanan belum dirilis. Rilis pesanan produksi terlebih dahulu agar bahan dapat diterbitkan."
            : detail.status === "COMPLETED" || detail.status === "CANCELLED"
              ? `Pesanan berstatus ${detail.status}; seluruh transaksi bahan sudah ditutup.`
              : `Pesanan berstatus ${detail.status}; penerbitan bahan baru tidak tersedia, namun konsumsi dan pengembalian masih dapat dicatat bila ada sisa WIP.`}
        </Alert>
      ) : null}
    </div>
  );
}
