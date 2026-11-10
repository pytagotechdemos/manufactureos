"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { downloadCsv } from "@/lib/csv";
import { ManufacturingNav } from "@/components/manufacturing/manufacturing-nav";
import { formatDate, formatQuantity, todayJakarta } from "@/lib/format";

type Inspection = {
  id: string;
  number: string;
  status: string;
  inspectedQty: string;
  acceptedQty: string;
  rejectedQty: string;
  reworkQty: string;
  inspectedAt: string | null;
  manufacturingOrder: {
    id: string;
    number: string;
    status: string;
    warehouseId?: string | null;
    item: { sku: string; name: string };
  };
  productionReceipts: Array<{ id: string; number: string; acceptedQty: string; status: string }>;
};

type Warehouse = { id: string; code: string; name: string };

type ReceiptRow = {
  id: string;
  number: string;
  acceptedQty: string;
  status: string;
  inspectionNumber: string;
  manufacturingOrderNumber: string;
};

function remainingAccepted(inspection: Inspection): Decimal {
  const received = inspection.productionReceipts
    .filter((receipt) => receipt.status === "POSTED")
    .reduce((sum, receipt) => sum.plus(receipt.acceptedQty), new Decimal(0));
  const diff = new Decimal(inspection.acceptedQty).minus(received);
  return diff.isPositive() ? diff : new Decimal(0);
}

export default function ReceiptsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode | null>(null);

  const [formNumber, setFormNumber] = useState("");
  const [formInspectionId, setFormInspectionId] = useState("");
  const [formWarehouseId, setFormWarehouseId] = useState("");
  const [formAcceptedQty, setFormAcceptedQty] = useState("");
  const [receiptPage, setReceiptPage] = useState(1);
  const [receiptPageSize, setReceiptPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inspectionRes, warehouseRes] = await Promise.all([
        fetch("/api/v1/quality/inspections"),
        fetch("/api/v1/quality/warehouses"),
      ]);
      if (!inspectionRes.ok || !warehouseRes.ok) throw new Error("Gagal memuat data penerimaan produksi");
      const [inspectionJson, warehouseJson] = await Promise.all([inspectionRes.json(), warehouseRes.json()]);
      const allInspections = [...(inspectionJson.data ?? [])] as Inspection[];
      const totalInspections = Number(inspectionJson.page?.total ?? allInspections.length);
      const offsets = Array.from({ length: Math.max(0, Math.ceil(totalInspections / 100) - 1) }, (_, index) => (index + 1) * 100);
      for (let index = 0; index < offsets.length; index += 10) {
        const pages = await Promise.all(offsets.slice(index, index + 10).map(async (offset) => {
          const response = await fetch(`/api/v1/quality/inspections?limit=100&offset=${offset}`);
          if (!response.ok) throw new Error("Gagal memuat seluruh riwayat inspeksi QC");
          return response.json();
        }));
        allInspections.push(...pages.flatMap((page) => page.data ?? []));
      }
      setInspections(allInspections);
      setWarehouses(warehouseJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data penerimaan produksi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const receivable = useMemo(
    () => inspections.filter((inspection) => inspection.status === "POSTED" && remainingAccepted(inspection).greaterThan(0)),
    [inspections],
  );

  const recentReceipts = useMemo<ReceiptRow[]>(() => {
    const rows: ReceiptRow[] = [];
    for (const inspection of inspections) {
      for (const receipt of inspection.productionReceipts) {
        rows.push({
          id: receipt.id,
          number: receipt.number,
          acceptedQty: receipt.acceptedQty,
          status: receipt.status,
          inspectionNumber: inspection.number,
          manufacturingOrderNumber: inspection.manufacturingOrder.number,
        });
      }
    }
    return rows;
  }, [inspections]);

  const paginatedReceipts = useMemo(() => {
    const start = (receiptPage - 1) * receiptPageSize;
    return recentReceipts.slice(start, start + receiptPageSize);
  }, [recentReceipts, receiptPage, receiptPageSize]);

  function exportReceiptsCsv() {
    if (recentReceipts.length === 0) return;
    const headers = [
      "Nomor Penerimaan",
      "Nomor Inspeksi",
      "Nomor MO",
      "Kuantitas Diterima",
      "Status",
    ];
    const rows = recentReceipts.map((r) => [
      r.number,
      r.inspectionNumber,
      r.manufacturingOrderNumber,
      r.acceptedQty,
      r.status,
    ]);
    downloadCsv(`penerimaan-produksi-${todayJakarta()}.csv`, headers, rows);
  }

  const selectedInspection = receivable.find((inspection) => inspection.id === formInspectionId);

  function suggestNumber() {
    const stamp = todayJakarta().replace(/-/g, "");
    return `REC-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const onInspectionChange = useCallback((value: string) => {
    setFormInspectionId(value);
    const inspection = receivable.find((entry) => entry.id === value);
    if (inspection) {
      setFormAcceptedQty(remainingAccepted(inspection).toString());
      if (inspection.manufacturingOrder.warehouseId) {
        setFormWarehouseId(inspection.manufacturingOrder.warehouseId);
      } else if (warehouses.length > 0 && !formWarehouseId) {
        setFormWarehouseId(warehouses[0]!.id);
      }
    } else {
      setFormAcceptedQty("");
    }
  }, [receivable, warehouses, formWarehouseId]);

  useEffect(() => {
    if (typeof window !== "undefined" && receivable.length > 0 && !formInspectionId) {
      const params = new URLSearchParams(window.location.search);
      const inspectionParam = params.get("inspectionId");
      const moParam = params.get("mo");
      if (inspectionParam) {
        const found = receivable.find((entry) => entry.id === inspectionParam);
        if (found) onInspectionChange(found.id);
      } else if (moParam) {
        const found = receivable.find((entry) => entry.manufacturingOrder.number.toLowerCase() === moParam.toLowerCase());
        if (found) onInspectionChange(found.id);
      }
    }
  }, [receivable, formInspectionId, onInspectionChange]);

  async function handlePostReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInspection) {
      setError("Pilih pemeriksaan QC yang sudah diposting.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        number: formNumber || suggestNumber(),
        manufacturingOrderId: selectedInspection.manufacturingOrder.id,
        inspectionId: selectedInspection.id,
        warehouseId: formWarehouseId,
        acceptedQty: formAcceptedQty,
        idempotencyKey: crypto.randomUUID(),
      };
      const res = await fetch("/api/v1/quality/production-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memposting penerimaan produksi");
      setNotice(
        <span>
          Penerimaan {body.number} berhasil diposting ke stok barang jadi.{" "}
          <Link
            href="/inventory"
            className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
          >
            Lihat di Persediaan &rarr;
          </Link>
        </span>
      );
      setFormNumber("");
      setFormInspectionId("");
      setFormAcceptedQty("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memposting penerimaan produksi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Shop Floor & Manufacturing"
        title="Production Receipts (Penerimaan Produksi)"
        description="Posting kuantitas diterima dari inspeksi QC ke saldo stok gudang barang jadi (FG) atau sub-assembly."
        actions={
          <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      <ManufacturingNav />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Siap diterima"
            description="Inspeksi QC berstatus diposting yang masih memiliki kuantitas diterima belum masuk stok."
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat inspeksi…</div>
            ) : receivable.length === 0 ? (
              <EmptyState
                title="Belum ada inspeksi siap diterima"
                description="Posting pemeriksaan QC terlebih dahulu di halaman Kontrol kualitas."
              />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Inspeksi</Th>
                    <Th>MO</Th>
                    <Th>Barang</Th>
                    <Th align="right">Diterima QC</Th>
                    <Th align="right">Belum diterima</Th>
                    <Th align="right">Tanggal</Th>
                    <Th align="right">Aksi</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {receivable.map((inspection) => (
                    <Tr key={inspection.id} className={formInspectionId === inspection.id ? "bg-brand-50/60" : undefined}>
                      <Td className="tnum font-medium">{inspection.number}</Td>
                      <Td className="tnum text-slate-600">{inspection.manufacturingOrder.number}</Td>
                      <Td className="text-slate-600">
                        {inspection.manufacturingOrder.item.sku} — {inspection.manufacturingOrder.item.name}
                      </Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(inspection.acceptedQty)}</Td>
                      <Td align="right" className="tnum font-medium text-brand-700">{formatQuantity(remainingAccepted(inspection).toString())}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(inspection.inspectedAt)}</Td>
                      <Td align="right">
                        <Button
                          size="sm"
                          variant={formInspectionId === inspection.id ? "primary" : "secondary"}
                          onClick={() => onInspectionChange(inspection.id)}
                        >
                          Terima &rarr;
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
          <CardHeader title="Posting penerimaan" description="Kuantitas tidak boleh melebihi sisa yang diterima QC." />
          <CardBody>
            <form className="space-y-4" onSubmit={handlePostReceipt}>
              <Field label="Nomor penerimaan" required hint="Kosongkan untuk nomor otomatis.">
                <Input placeholder={suggestNumber()} value={formNumber} onChange={(event) => setFormNumber(event.target.value)} />
              </Field>
              <Field label="Inspeksi QC" required>
                <Select required value={formInspectionId} onChange={(event) => onInspectionChange(event.target.value)}>
                  <option value="">Pilih inspeksi</option>
                  {receivable.map((inspection) => (
                    <option key={inspection.id} value={inspection.id}>
                      {inspection.number} · {inspection.manufacturingOrder.number} · sisa {formatQuantity(remainingAccepted(inspection).toString())}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Gudang barang jadi" required>
                <Select required value={formWarehouseId} onChange={(event) => setFormWarehouseId(event.target.value)}>
                  <option value="">Pilih gudang</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Kuantitas diterima"
                required
                hint={selectedInspection ? `Maksimal ${formatQuantity(remainingAccepted(selectedInspection).toString())}.` : undefined}
              >
                <Input
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  max={selectedInspection ? remainingAccepted(selectedInspection).toString() : undefined}
                  required
                  value={formAcceptedQty}
                  onChange={(event) => setFormAcceptedQty(event.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary" loading={saving} disabled={receivable.length === 0}>
                {saving ? "Memposting…" : "Posting penerimaan"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Penerimaan terbaru"
          description={`${recentReceipts.length} penerimaan produksi tercatat.`}
          actions={
            recentReceipts.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={exportReceiptsCsv}>
                Ekspor CSV
              </Button>
            ) : undefined
          }
        />
        <CardBody className="p-0">
          {recentReceipts.length === 0 ? (
            <EmptyState compact title="Belum ada penerimaan produksi" />
          ) : (
            <>
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Inspeksi</Th>
                    <Th>MO</Th>
                    <Th align="right">Kuantitas</Th>
                    <Th>Status</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {paginatedReceipts.map((receipt) => (
                    <Tr key={receipt.id}>
                      <Td className="tnum font-medium">{receipt.number}</Td>
                      <Td className="tnum text-slate-600">{receipt.inspectionNumber}</Td>
                      <Td className="tnum text-slate-600">{receipt.manufacturingOrderNumber}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(receipt.acceptedQty)}</Td>
                      <Td>{<StatusBadge status={receipt.status} />}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                currentPage={receiptPage}
                totalItems={recentReceipts.length}
                pageSize={receiptPageSize}
                onPageChange={setReceiptPage}
                onPageSizeChange={(newSize) => {
                  setReceiptPageSize(newSize);
                  setReceiptPage(1);
                }}
              />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
