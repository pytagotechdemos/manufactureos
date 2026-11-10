"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate, formatQuantity, todayJakarta } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, SearchInput, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { downloadCsv } from "@/lib/csv";
import { EditBomDraftModal } from "./edit-bom-draft-modal";
import { CloneBomModal } from "./clone-bom-modal";

type BomSummary = {
  id: string;
  number: string;
  revision: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";
  outputQty: string;
  effectiveDate: string | null;
  outputItem: { id: string; sku: string; name: string };
  _count: { lines: number };
};

type BomDetail = BomSummary & {
  approvedAt: string | null;
  outputItem: BomSummary["outputItem"] & { baseUom: { code: string } };
  lines: Array<{
    id: string;
    quantity: string;
    scrapRate: string;
    sequence: number;
    notes: string | null;
    component: { id: string; sku: string; name: string; supplyType: "MAKE" | "BUY"; baseUom: { code: string } };
    uom: { id: string; code: string; name: string };
  }>;
};

type Explosion = {
  requirements: Array<{
    itemId: string;
    quantity: string;
    uom: string;
    itemSku?: string;
    itemName?: string;
  }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Permintaan gagal");
  return body;
}

export function BomExplorer({ canApprove, canCreate }: { canApprove: boolean; canCreate: boolean }) {
  const [boms, setBoms] = useState<BomSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BomDetail | null>(null);
  const [explosion, setExplosion] = useState<Explosion | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bomPage, setBomPage] = useState(1);
  const [bomPageSize, setBomPageSize] = useState(10);

  const paginatedBoms = useMemo(() => {
    const start = (bomPage - 1) * bomPageSize;
    return boms.slice(start, start + bomPageSize);
  }, [boms, bomPage, bomPageSize]);

  function exportBomsCsv() {
    if (boms.length === 0) return;
    const headers = [
      "Nomor BOM",
      "Revisi",
      "SKU Output",
      "Nama Output",
      "Status",
      "Target Output",
      "Jumlah Komponen",
      "Tanggal Efektif",
    ];
    const rows = boms.map((bom) => [
      bom.number,
      bom.revision,
      bom.outputItem.sku,
      bom.outputItem.name,
      bom.status,
      bom.outputQty,
      bom._count.lines,
      bom.effectiveDate ? formatDate(bom.effectiveDate) : "",
    ]);
    downloadCsv(`daftar-bom-${todayJakarta()}.csv`, headers, rows);
  }

  function exportLinesCsv() {
    if (!detail || detail.lines.length === 0) return;
    const headers = [
      "Baris",
      "SKU Komponen",
      "Nama Komponen",
      "Tipe Pasok",
      "Kuantitas",
      "Satuan",
      "Scrap Rate (%)",
      "Catatan",
    ];
    const rows = detail.lines.map((line) => [
      line.sequence,
      line.component.sku,
      line.component.name,
      line.component.supplyType === "MAKE" ? "Buat Sendiri" : "Beli",
      line.quantity,
      line.uom.code,
      Number(line.scrapRate) > 0 ? (Number(line.scrapRate) * 100).toFixed(2) : "0",
      line.notes ?? "",
    ]);
    downloadCsv(`komponen-bom-${detail.number}-rev-${detail.revision}.csv`, headers, rows);
  }

  function exportExplosionCsv() {
    if (!detail || !explosion || explosion.requirements.length === 0) return;
    const headers = [
      "SKU Bahan",
      "Nama Bahan",
      "Kuantitas Bersih",
      "Satuan",
      "Target Output",
      "Nomor BOM",
      "Revisi",
    ];
    const rows = explosion.requirements.map((req) => {
      const fallback = detail.lines.find((l) => l.component.id === req.itemId);
      const sku = req.itemSku || fallback?.component.sku || req.itemId;
      const name = req.itemName || fallback?.component.name || "";
      return [
        sku,
        name,
        req.quantity,
        req.uom,
        quantity,
        detail.number,
        detail.revision,
      ];
    });
    downloadCsv(`eksplosi-bom-${detail.number}-qty-${quantity}.csv`, headers, rows);
  }

  const loadBoms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const result = await readJson<{ data: BomSummary[]; page?: { total: number } }>(await fetch(`/api/v1/boms?${params}`));
      const allBoms = [...result.data];
      const offsets = Array.from({ length: Math.max(0, Math.ceil(Number(result.page?.total ?? allBoms.length) / 100) - 1) }, (_, index) => (index + 1) * 100);
      for (let index = 0; index < offsets.length; index += 10) {
        const pages = await Promise.all(
          offsets.slice(index, index + 10).map(async (offset) => {
            const pageParams = new URLSearchParams({ limit: "100", offset: String(offset) });
            if (search) pageParams.set("search", search);
            if (status) pageParams.set("status", status);
            return readJson<{ data: BomSummary[] }>(await fetch(`/api/v1/boms?${pageParams}`));
          }),
        );
        allBoms.push(...pages.flatMap((page) => page.data));
      }
      setBoms(allBoms);
      if (selectedId && !allBoms.some((bom) => bom.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat BOM");
    } finally {
      setLoading(false);
    }
  }, [search, selectedId, status]);

  useEffect(() => {
    void loadBoms();
  }, [loadBoms]);

  async function selectBom(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setExplosion(null);
    setError(null);
    try {
      const result = await readJson<{ data: BomDetail }>(await fetch(`/api/v1/boms/${id}`));
      setDetail(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat detail BOM");
    } finally {
      setDetailLoading(false);
    }
  }

  async function runExplosion() {
    if (!selectedId) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await readJson<{ data: Explosion }>(
        await fetch(`/api/v1/boms/${selectedId}/explosion?quantity=${encodeURIComponent(quantity)}`),
      );
      setExplosion(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menghitung eksplosi BOM");
    } finally {
      setActionLoading(false);
    }
  }

  async function performAction(action: "submit-review" | "approve" | "obsolete" | "reject") {
    if (!selectedId) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      await readJson(await fetch(`/api/v1/boms/${selectedId}/${action}`, { method: "POST" }));
      setNotice(
        `BOM ${
          action === "submit-review"
            ? "diajukan tinjauan"
            : action === "approve"
              ? "disetujui"
              : action === "reject"
                ? "dikembalikan ke status draf"
                : "dinyatakan kedaluwarsa"
        } berhasil.`,
      );
      await loadBoms();
      await selectBom(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aksi gagal");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteDraft() {
    if (!selectedId || !window.confirm("Apakah Anda yakin ingin menghapus draf BOM ini?")) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      await readJson(await fetch(`/api/v1/boms/${selectedId}`, { method: "DELETE" }));
      setNotice("Draf BOM berhasil dihapus.");
      setSelectedId(null);
      setDetail(null);
      await loadBoms();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menghapus draf BOM");
    } finally {
      setActionLoading(false);
    }
  }

  const selectedStatus = detail?.status;
  const canSubmit = selectedStatus === "DRAFT";
  const canApproveAction = selectedStatus === "IN_REVIEW";
  const canObsolete = selectedStatus === "APPROVED";
  const formattedDate = useMemo(() => (detail?.effectiveDate ? formatDate(detail.effectiveDate) : "Belum ditetapkan"), [detail?.effectiveDate]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teknik"
        title="Eksplorasi BOM"
        description="Tinjau revisi BOM, periksa struktur komponen, dan hitung kebutuhan bahan baku hierarkis."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canCreate ? (
              <Link
                href="/boms/create"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-brand-700"
              >
                + Buat BOM
              </Link>
            ) : null}
            <Button variant="secondary" onClick={() => { void loadBoms(); }} loading={loading}>
              Muat ulang
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-sm">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setBomPage(1);
            }}
            placeholder="Cari nomor BOM atau barang…"
          />
        </div>
        <div className="w-48">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setBomPage(1);
            }}
            aria-label="Filter status BOM"
          >
            <option value="">Semua status</option>
            <option value="DRAFT">Draf</option>
            <option value="IN_REVIEW">Ditinjau</option>
            <option value="APPROVED">Disetujui</option>
            <option value="OBSOLETE">Kedaluwarsa</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card>
          <CardHeader
            title="Revisi BOM"
            description={`${boms.length} revisi BOM ditemukan.`}
            actions={
              boms.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={exportBomsCsv}>
                  Ekspor CSV
                </Button>
              ) : undefined
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat BOM…</div>
            ) : boms.length === 0 ? (
              <EmptyState
                title="Tidak ada revisi BOM"
                description={search || status ? "Coba ubah kata kunci atau filter status." : "Buat BOM pertama dari menu Buat BOM."}
              />
            ) : (
              <>
                <div className="divide-y divide-slate-100">
                  {paginatedBoms.map((bom) => (
                    <button
                      key={bom.id}
                      type="button"
                      onClick={() => void selectBom(bom.id)}
                      className={`block w-full px-5 py-3.5 text-left transition hover:bg-slate-50 ${
                        selectedId === bom.id ? "bg-brand-50/70" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900 tnum">
                            {bom.outputItem.sku} · {bom.outputItem.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 tnum">
                            {bom.number} · Rev {bom.revision}
                          </p>
                        </div>
                        <StatusBadge status={bom.status} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500 tnum">
                        Output {formatQuantity(bom.outputQty)} · {bom._count.lines} komponen
                      </p>
                    </button>
                  ))}
                </div>
                <Pagination
                  currentPage={bomPage}
                  totalItems={boms.length}
                  pageSize={bomPageSize}
                  onPageChange={setBomPage}
                  onPageSizeChange={(newSize) => {
                    setBomPageSize(newSize);
                    setBomPage(1);
                  }}
                />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          {detailLoading ? (
            <CardBody>
              <div className="p-8 text-center text-slate-500">Memuat detail BOM…</div>
            </CardBody>
          ) : !detail ? (
            <CardBody>
              <EmptyState
                compact
                title="Pilih revisi BOM"
                description="Pilih salah satu revisi di panel kiri untuk melihat hierarki komponen dan menjalankan kalkulasi bahan."
              />
            </CardBody>
          ) : (
            <>
              <CardHeader
                title={`${detail.outputItem.sku} · ${detail.outputItem.name}`}
                description={`${detail.number} · Revisi ${detail.revision}`}
                actions={<StatusBadge status={detail.status} />}
              />
              <CardBody className="space-y-5">
                <dl className="grid grid-cols-2 gap-3 rounded-md border border-slate-100 bg-slate-50/70 p-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-500">Output Target</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 tnum">
                      {formatQuantity(detail.outputQty)} {detail.outputItem.baseUom.code}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tanggal Efektif</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 tnum">{formattedDate}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Jumlah Komponen</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 tnum">{detail.lines.length} baris</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Persetujuan</dt>
                    <dd className="mt-0.5 font-semibold text-slate-800 tnum">
                      {detail.approvedAt ? formatDate(detail.approvedAt) : "Belum disetujui"}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
                  {canCreate ? (
                    <CloneBomModal
                      sourceBom={{
                        id: detail.id,
                        number: detail.number,
                        revision: detail.revision,
                        outputItem: detail.outputItem,
                        linesCount: detail.lines.length,
                      }}
                      onCloned={async (newBomId) => {
                        setNotice(`Revisi draf baru berhasil dibuat dari ${detail.number} (Rev ${detail.revision}).`);
                        await loadBoms();
                        await selectBom(newBomId);
                      }}
                    />
                  ) : null}
                  {canCreate && canSubmit ? (
                    <EditBomDraftModal
                      detail={detail}
                      onSaved={async () => {
                        setNotice("Perubahan draf BOM berhasil disimpan.");
                        await loadBoms();
                        await selectBom(detail.id);
                      }}
                    />
                  ) : null}
                  {canCreate ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!canSubmit || actionLoading}
                      loading={actionLoading && canSubmit}
                      onClick={() => void performAction("submit-review")}
                    >
                      Ajukan tinjauan
                    </Button>
                  ) : null}
                  {canCreate && canSubmit ? (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={actionLoading}
                      loading={actionLoading}
                      onClick={() => void handleDeleteDraft()}
                    >
                      Hapus draf
                    </Button>
                  ) : null}
                  {canApprove ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!canApproveAction || actionLoading}
                      loading={actionLoading && canApproveAction}
                      onClick={() => void performAction("approve")}
                    >
                      Setujui
                    </Button>
                  ) : null}
                  {canApprove || canCreate ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!canApproveAction || actionLoading}
                      loading={actionLoading && canApproveAction}
                      onClick={() => {
                        if (window.confirm("Kembalikan BOM ini ke status draf untuk perbaikan?")) {
                          void performAction("reject");
                        }
                      }}
                    >
                      Tolak ke draf
                    </Button>
                  ) : null}
                  {canApprove ? (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!canObsolete || actionLoading}
                      loading={actionLoading && canObsolete}
                      onClick={() => void performAction("obsolete")}
                    >
                      Kedaluwarsa
                    </Button>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800">Komponen Bahan Baku</h3>
                    {detail.lines.length > 0 ? (
                      <Button variant="secondary" size="sm" onClick={exportLinesCsv}>
                        Ekspor CSV
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
                    <Table>
                      <TableHead>
                        <Tr>
                          <Th className="w-12">#</Th>
                          <Th>Komponen</Th>
                          <Th>Tipe Pasok</Th>
                          <Th align="right">Kuantitas</Th>
                          <Th align="right">Scrap (%)</Th>
                          <Th>Catatan</Th>
                        </Tr>
                      </TableHead>
                      <TableBody>
                        {detail.lines.map((line) => (
                          <Tr key={line.id}>
                            <Td className="tnum text-slate-500">{line.sequence}</Td>
                            <Td>
                              <p className="font-medium text-slate-900 tnum">{line.component.sku}</p>
                              <p className="text-xs text-slate-500">{line.component.name}</p>
                            </Td>
                            <Td>
                              <span
                                className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                                  line.component.supplyType === "MAKE"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-blue-50 text-blue-700 border border-blue-200"
                                }`}
                              >
                                {line.component.supplyType === "MAKE" ? "Buat Sendiri" : "Beli"}
                              </span>
                            </Td>
                            <Td align="right" className="tnum font-medium text-slate-700">
                              {formatQuantity(line.quantity)} {line.uom.code}
                            </Td>
                            <Td align="right" className="tnum text-slate-600">
                              {Number(line.scrapRate) > 0
                                ? `${(Number(line.scrapRate) * 100).toFixed(1)}%`
                                : "0%"}
                            </Td>
                            <Td className="text-xs text-slate-500">{line.notes ?? "—"}</Td>
                          </Tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Eksplosi Kebutuhan Bahan</h4>
                      <p className="text-xs text-slate-500">
                        Hitung seluruh kebutuhan bahan baku (level daun) untuk target kuantitas output yang diminta.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-28">
                        <Input
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          aria-label="Kuantitas target"
                        />
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={actionLoading}
                        onClick={() => void runExplosion()}
                      >
                        Hitung
                      </Button>
                    </div>
                  </div>

                  {explosion ? (
                    <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Kebutuhan Bersih ({explosion.requirements.length} item bahan)
                        </p>
                        <Button variant="secondary" size="sm" onClick={exportExplosionCsv}>
                          Ekspor CSV
                        </Button>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {explosion.requirements.map((req) => {
                          const fallback = detail.lines.find((l) => l.component.id === req.itemId);
                          const sku = req.itemSku || fallback?.component.sku;
                          const name = req.itemName || fallback?.component.name;
                          return (
                            <div
                              key={`${req.itemId}-${req.uom}`}
                              className="flex items-center justify-between py-2 text-xs"
                            >
                              <div>
                                <span className="font-semibold text-slate-800 tnum">{sku ?? req.itemId}</span>
                                {name ? <span className="ml-2 text-slate-600">{name}</span> : null}
                              </div>
                              <span className="font-mono text-xs font-semibold text-brand-700">
                                {formatQuantity(req.quantity)} {req.uom}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Tentukan jumlah output lalu klik tombol <strong>Hitung</strong> untuk melihat rincian bahan baku yang dibutuhkan.
                    </p>
                  )}
                </div>
              </CardBody>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
