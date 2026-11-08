"use client";

import Link from "next/link";
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

function toNumber(value: string): number {
  return Number(value);
}

function remainingIssue(material: MoMaterial): number {
  return Math.max(toNumber(material.plannedQty) - toNumber(material.issuedQty), 0);
}

function remainingWip(material: MoMaterial): number {
  return Math.max(
    toNumber(material.issuedQty) - toNumber(material.consumedQty) - toNumber(material.returnedQty),
    0,
  );
}

const linkClasses =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900";

export default function MaterialsPage() {
  const [orders, setOrders] = useState<MoSummary[]>([]);
  const [selectedMoId, setSelectedMoId] = useState("");
  const [detail, setDetail] = useState<MoDetail | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [issueQty, setIssueQty] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [returnQty, setReturnQty] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/orders?limit=100");
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat pesanan produksi");
      const rows = (json.data ?? []) as MoSummary[];
      setOrders(rows);
      setSelectedMoId((current) => {
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

  function selectMaterial(material: MoMaterial) {
    setSelectedMaterialId(material.id);
    setIssueQty(remainingIssue(material) > 0 ? String(remainingIssue(material)) : "");
    const wip = remainingWip(material);
    setConsumeQty(wip > 0 ? String(wip) : "");
    setReturnQty("");
  }

  async function postAction(
    materialId: string,
    action: "issue" | "consume" | "return",
    quantity: string,
    successMessage: string,
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
        eyebrow="Produksi"
        title="Material pesanan produksi"
        description="Terbitkan bahan dari gudang ke WIP, catat konsumsi aktual, dan kembalikan sisa material."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link className={linkClasses} href="/manufacturing">
              Pesanan produksi
            </Link>
            <Link className={linkClasses} href="/manufacturing/work-orders">
              Pesanan kerja
            </Link>
            <Link className={linkClasses} href="/manufacturing/receipts">
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
            title="Bahan pesanan"
            description="Menerbitkan bahan memindahkan stok dari gudang sumber ke gudang WIP."
          />
          <CardBody className="space-y-4">
            <Field label="Pesanan produksi" required>
              <Select required value={selectedMoId} onChange={(event) => setSelectedMoId(event.target.value)}>
                <option value="">Pilih pesanan produksi</option>
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
              <EmptyState compact title="Belum ada pesanan dipilih" description="Pilih pesanan produksi di atas." />
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
                      <Th>#</Th>
                      <Th>Bahan</Th>
                      <Th align="right">Rencana</Th>
                      <Th align="right">Terbit</Th>
                      <Th align="right">Konsumsi</Th>
                      <Th align="right">Kembali</Th>
                      <Th align="right">Sisa WIP</Th>
                      <Th align="right">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {detail.materials.map((material) => (
                      <Tr key={material.id} className={selectedMaterialId === material.id ? "bg-brand-50/60" : undefined}>
                        <Td className="tnum text-slate-500">{material.sequence}</Td>
                        <Td>
                          <span className="tnum font-medium text-slate-800">{material.item.sku}</span>
                          <span className="ml-2 text-slate-600">{material.item.name}</span>
                        </Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(material.plannedQty)}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(material.issuedQty)}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(material.consumedQty)}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(material.returnedQty)}</Td>
                        <Td align="right" className="tnum font-medium text-brand-700">{formatQuantity(String(remainingWip(material)))}</Td>
                        <Td align="right">
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
                ? `${selectedMaterial.item.sku} · sisa WIP ${formatQuantity(String(remainingWip(selectedMaterial)))} ${selectedMaterial.uomCode}`
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
                      `Bahan ${selectedMaterial.item.sku} diterbitkan ${issueQty} ${selectedMaterial.uomCode}.`,
                    );
                  }}
                >
                  <Field
                    label="Terbitkan bahan"
                    required
                    hint={`Sisa yang belum diterbitkan ${formatQuantity(String(remainingIssue(selectedMaterial)))} ${selectedMaterial.uomCode}.`}
                  >
                    <Input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      max={remainingIssue(selectedMaterial)}
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
                    disabled={!canIssue || remainingIssue(selectedMaterial) <= 0}
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
                      `Konsumsi ${selectedMaterial.item.sku} ${consumeQty} ${selectedMaterial.uomCode} dicatat.`,
                    );
                  }}
                >
                  <Field
                    label="Catat konsumsi"
                    required
                    hint={`Maksimal ${formatQuantity(String(remainingWip(selectedMaterial)))} ${selectedMaterial.uomCode}.`}
                  >
                    <Input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      max={remainingWip(selectedMaterial)}
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
                    disabled={!canDispose || remainingWip(selectedMaterial) <= 0}
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
                    hint={`Maksimal ${formatQuantity(String(remainingWip(selectedMaterial)))} ${selectedMaterial.uomCode}.`}
                  >
                    <Input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      max={remainingWip(selectedMaterial)}
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
                    disabled={!canDispose || remainingWip(selectedMaterial) <= 0}
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
