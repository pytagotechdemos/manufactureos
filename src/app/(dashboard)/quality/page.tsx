"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime, formatQuantity, todayJakarta } from "@/lib/format";

type PendingOrder = {
  id: string;
  number: string;
  item: { sku: string; name: string };
  quantity: string;
  producedQuantity: string;
  inspectedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  reworkQuantity: string;
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
  notes: string | null;
  inspectedAt: string | null;
};

export default function QualityPage() {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode | null>(null);

  const [formNumber, setFormNumber] = useState("");
  const [formMoId, setFormMoId] = useState("");
  const [formWoId, setFormWoId] = useState("");
  const [formInspected, setFormInspected] = useState("");
  const [formAccepted, setFormAccepted] = useState("");
  const [formRejected, setFormRejected] = useState("0");
  const [formRework, setFormRework] = useState("0");
  const [formDefect, setFormDefect] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [inspectionMode, setInspectionMode] = useState<"INITIAL" | "REWORK">("INITIAL");

  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(10);

  const [inspectionSearch, setInspectionSearch] = useState("");
  const [inspectionStatusFilter, setInspectionStatusFilter] = useState("");
  const [inspectionPage, setInspectionPage] = useState(1);
  const [inspectionPageSize, setInspectionPageSize] = useState(10);

  const filteredPending = useMemo(() => {
    const q = pendingSearch.trim().toLowerCase();
    if (!q) return pendingOrders;
    return pendingOrders.filter(
      (mo) =>
        mo.number.toLowerCase().includes(q) ||
        mo.item.sku.toLowerCase().includes(q) ||
        mo.item.name.toLowerCase().includes(q),
    );
  }, [pendingOrders, pendingSearch]);

  const paginatedPending = useMemo(() => {
    const start = (pendingPage - 1) * pendingPageSize;
    return filteredPending.slice(start, start + pendingPageSize);
  }, [filteredPending, pendingPage, pendingPageSize]);

  function exportPendingCsv() {
    if (filteredPending.length === 0) return;
    const headers = [
      "Nomor MO",
      "SKU Barang",
      "Nama Barang",
      "Target",
      "Diproduksi",
      "Diperiksa",
      "Sisa QC",
      "Rework",
    ];
    const rows = filteredPending.map((mo) => {
      const rem = Decimal.max(0, new Decimal(mo.producedQuantity).minus(mo.inspectedQuantity));
      const rew = new Decimal(mo.reworkQuantity ?? "0");
      return [
        mo.number,
        mo.item.sku,
        mo.item.name,
        mo.quantity,
        mo.producedQuantity,
        mo.inspectedQuantity,
        rem.toString(),
        rew.toString(),
      ];
    });
    downloadCsv(`pesanan-menunggu-qc-${todayJakarta()}.csv`, headers, rows);
  }

  const filteredInspections = useMemo(() => {
    const q = inspectionSearch.trim().toLowerCase();
    return inspections.filter((ins) => {
      if (inspectionStatusFilter && ins.status !== inspectionStatusFilter) return false;
      if (!q) return true;
      return (
        ins.number.toLowerCase().includes(q) ||
        ins.manufacturingOrder.number.toLowerCase().includes(q) ||
        (ins.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [inspections, inspectionSearch, inspectionStatusFilter]);

  const paginatedInspections = useMemo(() => {
    const start = (inspectionPage - 1) * inspectionPageSize;
    return filteredInspections.slice(start, start + inspectionPageSize);
  }, [filteredInspections, inspectionPage, inspectionPageSize]);

  function exportInspectionsCsv() {
    if (filteredInspections.length === 0) return;
    const headers = [
      "Nomor Inspeksi",
      "Nomor MO",
      "Status",
      "Diperiksa",
      "Diterima",
      "Ditolak",
      "Rework",
      "Waktu Diperiksa",
      "Catatan",
    ];
    const rows = filteredInspections.map((ins) => [
      ins.number,
      ins.manufacturingOrder.number,
      ins.status,
      ins.inspectedQty,
      ins.acceptedQty,
      ins.rejectedQty,
      ins.reworkQty,
      ins.inspectedAt ? formatDateTime(ins.inspectedAt) : "",
      ins.notes ?? "",
    ]);
    downloadCsv(`riwayat-inspeksi-qc-${todayJakarta()}.csv`, headers, rows);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, inRes] = await Promise.all([
        fetch("/api/v1/quality/pending-orders?limit=100&offset=0"),
        fetch("/api/v1/quality/inspections?limit=100&offset=0"),
      ]);
      if (!poRes.ok || !inRes.ok) throw new Error("Gagal memuat data kualitas");
      const [poJson, inJson] = await Promise.all([poRes.json(), inRes.json()]);
      const pendingAll = [...(poJson.data ?? [])] as PendingOrder[];
      const inspectionsAll = [...(inJson.data ?? [])] as Inspection[];
      const pendingOffsets = Array.from({ length: Math.max(0, Math.ceil(Number(poJson.page?.total ?? pendingAll.length) / 100) - 1) }, (_, index) => (index + 1) * 100);
      const inspectionOffsets = Array.from({ length: Math.max(0, Math.ceil(Number(inJson.page?.total ?? inspectionsAll.length) / 100) - 1) }, (_, index) => (index + 1) * 100);
      for (let index = 0; index < Math.max(pendingOffsets.length, inspectionOffsets.length); index += 10) {
        const [pendingPages, inspectionPages] = await Promise.all([
          Promise.all(pendingOffsets.slice(index, index + 10).map(async (offset) => {
            const response = await fetch(`/api/v1/quality/pending-orders?limit=100&offset=${offset}`);
            if (!response.ok) throw new Error("Gagal memuat data kualitas");
            return response.json();
          })),
          Promise.all(inspectionOffsets.slice(index, index + 10).map(async (offset) => {
            const response = await fetch(`/api/v1/quality/inspections?limit=100&offset=${offset}`);
            if (!response.ok) throw new Error("Gagal memuat data kualitas");
            return response.json();
          })),
        ]);
        pendingAll.push(...pendingPages.flatMap((page) => page.data ?? []));
        inspectionsAll.push(...inspectionPages.flatMap((page) => page.data ?? []));
      }
      setPendingOrders(pendingAll);
      setInspections(inspectionsAll);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data kualitas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelectMo = useCallback((id: string, preferredMode?: "INITIAL" | "REWORK") => {
    setFormMoId(id);
    setFormWoId("");
    const mo = pendingOrders.find((entry) => entry.id === id);
    if (mo) {
      const rem = Decimal.max(0, new Decimal(mo.producedQuantity).minus(mo.inspectedQuantity));
      const rew = new Decimal(mo.reworkQuantity ?? "0");
      const mode = preferredMode ?? (rem.isZero() && rew.greaterThan(0) ? "REWORK" : "INITIAL");
      setInspectionMode(mode);

      if (mode === "REWORK") {
        const rewStr = rew.toString();
        setFormInspected(rewStr);
        setFormAccepted(rewStr);
        setFormRejected("0");
        setFormRework("0");
        setFormNotes("[REWORK] Disposisi rework");
      } else {
        const remStr = rem.toString();
        setFormInspected(remStr);
        setFormAccepted(remStr);
        setFormRejected("0");
        setFormRework("0");
        setFormNotes("");
      }
    }
  }, [pendingOrders]);

  useEffect(() => {
    if (typeof window !== "undefined" && pendingOrders.length > 0 && !formMoId) {
      const params = new URLSearchParams(window.location.search);
      const moParam = params.get("mo");
      const moIdParam = params.get("moId");
      if (moIdParam) {
        const found = pendingOrders.find((entry) => entry.id === moIdParam);
        if (found) handleSelectMo(found.id);
      } else if (moParam) {
        const found = pendingOrders.find((entry) => entry.number.toLowerCase() === moParam.toLowerCase());
        if (found) handleSelectMo(found.id);
      }
    }
  }, [pendingOrders, formMoId, handleSelectMo]);

  const selectedMo = pendingOrders.find((mo) => mo.id === formMoId);
  const workOrders = selectedMo?.workOrders ?? [];
  const remainingToInspect = selectedMo
    ? Decimal.max(0, new Decimal(selectedMo.producedQuantity).minus(selectedMo.inspectedQuantity))
    : new Decimal(0);
  const outstandingRework = selectedMo ? new Decimal(selectedMo.reworkQuantity ?? "0") : new Decimal(0);

  function handleSwitchMode(mode: "INITIAL" | "REWORK") {
    setInspectionMode(mode);
    if (!selectedMo) return;
    if (mode === "REWORK") {
      const rewStr = outstandingRework.toString();
      setFormInspected(rewStr);
      setFormAccepted(rewStr);
      setFormRejected("0");
      setFormRework("0");
      setFormNotes("[REWORK] Disposisi rework");
    } else {
      const remStr = remainingToInspect.toString();
      setFormInspected(remStr);
      setFormAccepted(remStr);
      setFormRejected("0");
      setFormRework("0");
      setFormNotes("");
    }
  }

  function suggestInspectionNumber() {
    const stamp = todayJakarta().replace(/-/g, "");
    return `INS-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  async function handleCreateInspection(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const inspected = formInspected.trim();
    const accepted = formAccepted.trim();
    const rejected = formRejected.trim() || "0";
    const rework = formRework.trim() || "0";
    try {
      const sum = new Decimal(accepted || "0").plus(rejected).plus(rework);
      if (!sum.equals(new Decimal(inspected || "0"))) {
        setError("Diterima + ditolak + rework harus sama dengan jumlah diperiksa.");
        setSubmitting(false);
        return;
      }
      if (inspectionMode === "REWORK" && new Decimal(inspected).greaterThan(outstandingRework)) {
        setError(`Kuantitas re-inspeksi rework tidak boleh melebihi sisa rework (${outstandingRework.toString()}).`);
        setSubmitting(false);
        return;
      }
      if (inspectionMode === "INITIAL" && new Decimal(inspected).greaterThan(remainingToInspect)) {
        setError(`Kuantitas inspeksi pertama tidak boleh melebihi sisa QC (${remainingToInspect.toString()}).`);
        setSubmitting(false);
        return;
      }
    } catch {
      setError("Format kuantitas tidak valid.");
      setSubmitting(false);
      return;
    }
    const finalNotes = inspectionMode === "REWORK"
      ? (formNotes.includes("[REWORK]") ? formNotes.trim() : `[REWORK] ${formNotes}`.trim())
      : formNotes.trim();

    try {
      const res = await fetch("/api/v1/quality/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: formNumber.trim() || suggestInspectionNumber(),
          manufacturingOrderId: formMoId,
          workOrderId: formWoId || undefined,
          inspectedQty: inspected,
          acceptedQty: accepted,
          rejectedQty: rejected,
          reworkQty: rework,
          defectCode: formDefect.trim() || undefined,
          notes: finalNotes || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || "Gagal membuat pemeriksaan");
      setNotice(`Pemeriksaan ${json?.data?.number ?? ""} berhasil dicatat sebagai draf. Silakan posting di Riwayat Pemeriksaan.`);
      setFormNumber("");
      setFormMoId("");
      setFormWoId("");
      setFormInspected("");
      setFormAccepted("");
      setFormRejected("0");
      setFormRework("0");
      setFormDefect("");
      setFormNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pemeriksaan");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePostInspection(inspection: Inspection) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/quality/inspections/${inspection.id}/post`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memposting pemeriksaan");
      const hasAccepted = new Decimal(inspection.acceptedQty).greaterThan(0);
      setNotice(
        <span>
          Pemeriksaan {inspection.number} berhasil diposting.{" "}
          {hasAccepted ? (
            <>
              Kuantitas yang diterima siap masuk ke stok barang jadi.{" "}
              <Link
                href={`/manufacturing/receipts?inspectionId=${inspection.id}`}
                className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
              >
                Buka Penerimaan Produksi &rarr;
              </Link>
            </>
          ) : (
            "Disposisi penolakan/rework telah diperbarui."
          )}
        </span>
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memposting pemeriksaan");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteInspection(inspection: Inspection) {
    if (!window.confirm(`Hapus draf pemeriksaan ${inspection.number}?`)) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/quality/inspections/${inspection.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menghapus pemeriksaan");
      setNotice(`Draf pemeriksaan ${inspection.number} berhasil dihapus.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus pemeriksaan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Kontrol kualitas"
        title="Kontrol Kualitas"
        description="Periksa kuantitas hasil produksi aktual dan tetapkan disposisi penerimaan, penolakan, atau rework."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
              href="/manufacturing/receipts"
            >
              Terima barang jadi &rarr;
            </Link>
            <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
              Muat ulang
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Pesanan Menunggu Pemeriksaan"
            description={`${filteredPending.length} pesanan menunggu inspeksi kualitas.`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-56">
                  <SearchInput
                    value={pendingSearch}
                    onChange={(val) => {
                      setPendingSearch(val);
                      setPendingPage(1);
                    }}
                    placeholder="Cari MO atau barang…"
                  />
                </div>
                {filteredPending.length > 0 ? (
                  <Button variant="secondary" size="sm" onClick={exportPendingCsv}>
                    Ekspor CSV
                  </Button>
                ) : null}
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat pesanan menunggu…</div>
            ) : filteredPending.length === 0 ? (
              <EmptyState
                title="Tidak ada pesanan menunggu pemeriksaan"
                description={
                  pendingSearch
                    ? "Tidak ada pesanan cocok dengan pencarian."
                    : "Pesanan produksi dengan output lantai pabrik akan muncul di sini."
                }
              />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th>Nomor MO</Th>
                      <Th>Barang</Th>
                      <Th align="right">Target</Th>
                      <Th align="right">Diproduksi</Th>
                      <Th align="right">Diperiksa</Th>
                      <Th align="right">Sisa QC</Th>
                      <Th align="right">Rework</Th>
                      <Th align="right">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedPending.map((mo) => {
                      const rem = Decimal.max(0, new Decimal(mo.producedQuantity).minus(mo.inspectedQuantity));
                      const rew = new Decimal(mo.reworkQuantity ?? "0");
                      const hasRem = rem.greaterThan(0);
                      const hasRew = rew.greaterThan(0);
                      return (
                        <Tr key={mo.id}>
                          <Td className="font-medium tnum">
                            <Link href={`/manufacturing?mo=${mo.id}`} className="font-semibold text-brand-600 hover:text-brand-800 hover:underline">
                              {mo.number}
                            </Link>
                          </Td>
                          <Td className="text-slate-600 tnum">{mo.item.sku} — {mo.item.name}</Td>
                          <Td align="right" className="tnum text-slate-500">{formatQuantity(mo.quantity)}</Td>
                          <Td align="right" className="tnum font-medium text-slate-700">{formatQuantity(mo.producedQuantity)}</Td>
                          <Td align="right" className="tnum text-slate-500">{formatQuantity(mo.inspectedQuantity)}</Td>
                          <Td align="right" className={`tnum font-semibold ${hasRem ? "text-blue-700" : "text-slate-400"}`}>{formatQuantity(rem.toString())}</Td>
                          <Td align="right" className={`tnum ${hasRew ? "font-semibold text-amber-600" : "text-slate-400"}`}>{formatQuantity(rew.toString())}</Td>
                          <Td align="right">
                            <div className="flex items-center justify-end gap-1.5">
                              {hasRem ? (
                                <Button
                                  size="sm"
                                  variant={formMoId === mo.id && inspectionMode === "INITIAL" ? "secondary" : "primary"}
                                  onClick={() => handleSelectMo(mo.id, "INITIAL")}
                                >
                                  {formMoId === mo.id && inspectionMode === "INITIAL" ? "Dipilih" : "Periksa"}
                                </Button>
                              ) : null}
                              {hasRew ? (
                                <Button
                                  size="sm"
                                  variant={formMoId === mo.id && inspectionMode === "REWORK" ? "primary" : "secondary"}
                                  className={formMoId === mo.id && inspectionMode === "REWORK" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-400 text-amber-700 hover:bg-amber-50"}
                                  onClick={() => handleSelectMo(mo.id, "REWORK")}
                                >
                                  {formMoId === mo.id && inspectionMode === "REWORK" ? "Rework (Dipilih)" : "Rework"}
                                </Button>
                              ) : null}
                              {!hasRem && !hasRew ? (
                                <span className="text-[12px] text-slate-400">—</span>
                              ) : null}
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={pendingPage}
                  totalItems={filteredPending.length}
                  pageSize={pendingPageSize}
                  onPageChange={setPendingPage}
                  onPageSizeChange={(newSize) => {
                    setPendingPageSize(newSize);
                    setPendingPage(1);
                  }}
                />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Buat Pemeriksaan" description="Catat disposisi hasil inspeksi kuantitas produksi." />
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={handleCreateInspection}>
              <Field label="Nomor pemeriksaan" required hint="Kosongkan untuk nomor otomatis.">
                <Input name="number" placeholder={suggestInspectionNumber()} value={formNumber} onChange={(e) => setFormNumber(e.target.value)} />
              </Field>
              <Field label="Pesanan produksi" required>
                <Select name="manufacturingOrderId" required onChange={(e) => handleSelectMo(e.target.value)} value={formMoId}>
                  <option value="">Pilih MO yang menunggu</option>
                  {pendingOrders.map((mo) => {
                    const rem = Decimal.max(0, new Decimal(mo.producedQuantity).minus(mo.inspectedQuantity));
                    const rew = new Decimal(mo.reworkQuantity ?? "0");
                    return (
                      <option key={mo.id} value={mo.id}>
                        {mo.number} · {mo.item.sku} (Sisa QC: {formatQuantity(rem.toString())}{rew.greaterThan(0) ? `, Rework: ${formatQuantity(rew.toString())}` : ""})
                      </option>
                    );
                  })}
                </Select>
              </Field>
              {selectedMo ? (
                <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 space-y-2">
                  <p className="font-semibold">{selectedMo.item.sku} — {selectedMo.item.name}</p>
                  <p>
                    Diproduksi: <span className="font-semibold">{formatQuantity(selectedMo.producedQuantity)}</span> · Sudah Diperiksa: <span className="font-semibold">{formatQuantity(selectedMo.inspectedQuantity)}</span>
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>Tersedia QC Pertama: <strong className="text-blue-700">{formatQuantity(remainingToInspect.toString())}</strong></span>
                    <span>Outstanding Rework: <strong className="text-amber-700">{formatQuantity(outstandingRework.toString())}</strong></span>
                  </div>
                  {remainingToInspect.greaterThan(0) && outstandingRework.greaterThan(0) ? (
                    <div className="pt-1 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={inspectionMode === "INITIAL" ? "primary" : "secondary"}
                        onClick={() => handleSwitchMode("INITIAL")}
                      >
                        Pemeriksaan Pertama
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={inspectionMode === "REWORK" ? "primary" : "secondary"}
                        onClick={() => handleSwitchMode("REWORK")}
                      >
                        Pemeriksaan Rework
                      </Button>
                    </div>
                  ) : null}
                  {inspectionMode === "REWORK" ? (
                    <p className="font-medium text-amber-800">
                      * Mode Re-Inspeksi Rework: Unit yang diterima akan siap diambil ke stok barang jadi, unit ditolak akan dicatat sebagai scrap, dan kuantitas rework pesanan akan berkurang.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {workOrders.length > 0 ? (
                <Field label="Pesanan kerja (opsional)">
                  <Select name="workOrderId" onChange={(e) => setFormWoId(e.target.value)} value={formWoId}>
                    <option value="">Semua operasi (tingkat MO)</option>
                    {workOrders.map((wo) => (
                      <option key={wo.id} value={wo.id}>{wo.number} · {wo.status}</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kuantitas diperiksa" required>
                  <Input name="inspectedQty" type="number" min="0.000001" step="0.000001" required value={formInspected} onChange={(e) => setFormInspected(e.target.value)} />
                </Field>
                <Field label="Kuantitas terima" required>
                  <Input name="acceptedQty" type="number" min="0" step="0.000001" required value={formAccepted} onChange={(e) => setFormAccepted(e.target.value)} />
                </Field>
                <Field label="Kuantitas tolak" required>
                  <Input name="rejectedQty" type="number" min="0" step="0.000001" required value={formRejected} onChange={(e) => setFormRejected(e.target.value)} />
                </Field>
                <Field label="Kuantitas rework" required>
                  <Input name="reworkQty" type="number" min="0" step="0.000001" required value={formRework} onChange={(e) => setFormRework(e.target.value)} />
                </Field>
              </div>
              <p className="text-[12px] text-slate-500">
                Diperiksa harus sama dengan Diterima + Ditolak + Rework.
              </p>
              <Field label="Kode cacat (opsional)">
                <Input name="defectCode" placeholder="contoh: PANEL-CRACK-01" value={formDefect} onChange={(e) => setFormDefect(e.target.value)} />
              </Field>
              <Field label="Catatan pemeriksaan (opsional)">
                <Input name="notes" placeholder={inspectionMode === "REWORK" ? "Keterangan hasil perbaikan / disposisi" : "Catatan atau observasi kualitas"} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
              </Field>
              <Button type="submit" variant="primary" loading={submitting} disabled={!formMoId}>
                {submitting ? "Menyimpan…" : inspectionMode === "REWORK" ? "Catat Re-Inspeksi Rework" : "Catat pemeriksaan"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Riwayat Pemeriksaan"
          description={`${filteredInspections.length} pemeriksaan ditampilkan.`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <SearchInput
                  value={inspectionSearch}
                  onChange={(val) => {
                    setInspectionSearch(val);
                    setInspectionPage(1);
                  }}
                  placeholder="Cari nomor inspeksi, MO…"
                />
              </div>
              <div className="w-36">
                <Select
                  value={inspectionStatusFilter}
                  onChange={(e) => {
                    setInspectionStatusFilter(e.target.value);
                    setInspectionPage(1);
                  }}
                  aria-label="Filter status inspeksi"
                >
                  <option value="">Semua status</option>
                  <option value="DRAFT">Draf</option>
                  <option value="POSTED">Diposting</option>
                </Select>
              </div>
              {filteredInspections.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={exportInspectionsCsv}>
                  Ekspor CSV
                </Button>
              ) : null}
            </div>
          }
        />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Memuat riwayat pemeriksaan…</div>
          ) : filteredInspections.length === 0 ? (
            <EmptyState
              title="Belum ada riwayat pemeriksaan"
              description={
                inspectionSearch || inspectionStatusFilter
                  ? "Tidak ada riwayat inspeksi cocok dengan filter."
                  : "Buat pemeriksaan baru menggunakan form di atas."
              }
            />
          ) : (
            <>
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>MO</Th>
                    <Th>Status</Th>
                    <Th align="right">Diperiksa</Th>
                    <Th align="right">Diterima</Th>
                    <Th align="right">Ditolak</Th>
                    <Th align="right">Rework</Th>
                    <Th align="right">Waktu diperiksa</Th>
                    <Th align="right">Aksi</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {paginatedInspections.map((ins) => {
                    const isReworkIns = ins.notes?.includes("[REWORK]");
                    return (
                      <Tr key={ins.id}>
                        <Td className="font-medium tnum">
                          <div className="flex items-center gap-1.5">
                            <span>{ins.number}</span>
                            {isReworkIns ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Rework
                              </span>
                            ) : null}
                          </div>
                        </Td>
                        <Td className="text-slate-600 tnum">
                          <Link
                            href={`/manufacturing?search=${encodeURIComponent(ins.manufacturingOrder.number)}`}
                            className="font-medium text-slate-700 hover:text-brand-600 hover:underline"
                          >
                            {ins.manufacturingOrder.number}
                          </Link>
                        </Td>
                        <Td>{<StatusBadge status={ins.status} />}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(ins.inspectedQty)}</Td>
                        <Td align="right" className="tnum font-semibold text-emerald-700">{formatQuantity(ins.acceptedQty)}</Td>
                        <Td align="right" className="tnum text-red-600">{formatQuantity(ins.rejectedQty)}</Td>
                        <Td align="right" className="tnum text-amber-600">{formatQuantity(ins.reworkQty)}</Td>
                        <Td align="right" className="tnum text-slate-500">{ins.inspectedAt ? formatDateTime(ins.inspectedAt) : "—"}</Td>
                        <Td align="right">
                          {ins.status === "DRAFT" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button variant="primary" size="sm" loading={submitting} onClick={() => { void handlePostInspection(ins); }}>
                                Posting
                              </Button>
                              <Button variant="secondary" size="sm" className="text-red-600 hover:text-red-700" loading={submitting} onClick={() => { void handleDeleteInspection(ins); }}>
                                Hapus
                              </Button>
                            </div>
                          ) : new Decimal(ins.acceptedQty).greaterThan(0) ? (
                            <Link
                              href={`/manufacturing/receipts?inspectionId=${ins.id}&mo=${encodeURIComponent(ins.manufacturingOrder.number)}`}
                              className="inline-flex items-center text-xs font-semibold text-brand-600 hover:underline"
                            >
                              Terima &rarr;
                            </Link>
                          ) : (
                            <span className="text-[12px] text-slate-400">—</span>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                currentPage={inspectionPage}
                totalItems={filteredInspections.length}
                pageSize={inspectionPageSize}
                onPageChange={setInspectionPage}
                onPageSizeChange={(newSize) => {
                  setInspectionPageSize(newSize);
                  setInspectionPage(1);
                }}
              />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
