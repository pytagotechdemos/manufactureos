"use client";

import Decimal from "decimal.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { ManufacturingNav } from "@/components/manufacturing/manufacturing-nav";
import { formatDateTime, formatMoney, formatQuantity, todayJakarta } from "@/lib/format";

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
  timeEntries: Array<{ minutes: string }>;
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
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [workCenterId, setWorkCenterId] = useState("");
  const [minutes, setMinutes] = useState("");
  const [completedQty, setCompletedQty] = useState("");
  const [rejectedQty, setRejectedQty] = useState("0");

  const [wcModalOpen, setWcModalOpen] = useState(false);
  const [wcCode, setWcCode] = useState("");
  const [wcName, setWcName] = useState("");
  const [wcHourlyRate, setWcHourlyRate] = useState("0");
  const [wcStandardMinutes, setWcStandardMinutes] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [firstWorkOrders, workCenterResponse] = await Promise.all([
        fetch("/api/v1/manufacturing/work-orders?limit=100&offset=0"),
        fetch("/api/v1/manufacturing/work-centers"),
      ]);
      if (!firstWorkOrders.ok || !workCenterResponse.ok) throw new Error("Gagal memuat Work Orders");
      const [firstPage, workCenterJson] = await Promise.all([firstWorkOrders.json(), workCenterResponse.json()]);
      const total = Number(firstPage.page?.total ?? firstPage.data?.length ?? 0);
      const offsets = Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, index) => (index + 1) * 100);
      const pages: Array<{ data?: WorkOrderRow[] }> = [];
      for (let index = 0; index < offsets.length; index += 10) {
        pages.push(...await Promise.all(offsets.slice(index, index + 10).map(async (offset) => {
          const response = await fetch(`/api/v1/manufacturing/work-orders?limit=100&offset=${offset}`);
          if (!response.ok) throw new Error("Gagal memuat seluruh Work Orders");
          return response.json();
        })));
      }
      setOrders([...(firstPage.data ?? []), ...pages.flatMap((page) => page.data ?? [])]);
      setWorkCenters(workCenterJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat Work Orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const moParam = params.get("mo");
      const qParam = params.get("q");
      if (moParam) setSearch(moParam);
      else if (qParam) setSearch(qParam);
    }
  }, []);

  const filtered = useMemo(() => {
    let result = filter === "SEMUA" ? orders : orders.filter((order) => order.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (order) =>
          order.number.toLowerCase().includes(q) ||
          order.manufacturingOrder.number.toLowerCase().includes(q) ||
          order.operationCode.toLowerCase().includes(q) ||
          (order.workCenter?.name ?? "").toLowerCase().includes(q) ||
          (order.workCenter?.code ?? "").toLowerCase().includes(q) ||
          (order.manufacturingOrder.item?.sku ?? "").toLowerCase().includes(q) ||
          (order.manufacturingOrder.item?.name ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [orders, filter, search]);

  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  function exportOrdersCsv() {
    if (filtered.length === 0) return;
    const headers = [
      "Nomor WO",
      "Nomor MO",
      "SKU Barang",
      "Nama Barang",
      "Operasi",
      "Work Center",
      "Status",
      "Target",
      "Selesai",
      "Reject",
      "Total Menit",
      "Waktu Mulai",
      "Waktu Selesai",
    ];
    const rows = filtered.map((order) => {
      const totalMinutes = order.timeEntries
        .reduce((total, entry) => total.plus(entry.minutes), new Decimal(0))
        .toString();
      return [
        order.number,
        order.manufacturingOrder.number,
        order.manufacturingOrder.item?.sku ?? "",
        order.manufacturingOrder.item?.name ?? "",
        order.operationCode,
        order.workCenter?.code ?? "",
        order.status,
        order.targetQuantity,
        order.completedQty,
        order.rejectedQty,
        totalMinutes,
        order.startedAt ? formatDateTime(order.startedAt) : "",
        order.completedAt ? formatDateTime(order.completedAt) : "",
      ];
    });
    downloadCsv(`daftar-work-orders-${todayJakarta()}.csv`, headers, rows);
  }

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? null;
  const remainingTarget = selectedOrder
    ? Decimal.max(0, new Decimal(selectedOrder.targetQuantity).minus(selectedOrder.completedQty).minus(selectedOrder.rejectedQty))
    : new Decimal(0);

  function selectOrder(order: WorkOrderRow) {
    setSelectedId(order.id);
    setWorkCenterId(order.workCenter?.id ?? "");
    setMinutes("");
    const rem = Decimal.max(0, new Decimal(order.targetQuantity).minus(order.completedQty).minus(order.rejectedQty));
    setCompletedQty(rem.isPositive() ? rem.toString() : "");
    setRejectedQty("0");
  }

  async function postAction(endpoint: string, body?: unknown, successMessage?: React.ReactNode) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Aksi Work Order gagal");
      if (successMessage) setNotice(successMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi Work Order gagal");
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
    const comp = new Decimal(completedQty || "0");
    const rej = new Decimal(rejectedQty || "0");
    if (comp.plus(rej).greaterThan(remainingTarget)) {
      setError(`Kuantitas selesai (${comp.toString()}) + reject (${rej.toString()}) melebihi sisa target (${remainingTarget.toString()}).`);
      return;
    }
    const moNum = selectedOrder.manufacturingOrder.number;
    await postAction(
      `/api/v1/manufacturing/work-orders/${selectedOrder.id}/complete`,
      { completedQty, rejectedQty: rejectedQty || "0" },
      <span>
        {selectedOrder.number} diselesaikan.{" "}
        <Link
          href={`/quality?mo=${moNum}`}
          className="ml-1 font-semibold underline underline-offset-2 hover:text-emerald-950"
        >
          Lanjut ke QC ({moNum}) &rarr;
        </Link>
      </span>,
    );
    setCompletedQty("");
    setRejectedQty("0");
  }

  async function handleCreateWorkCenter(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/work-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: wcCode.trim(),
          name: wcName.trim(),
          hourlyRate: wcHourlyRate.trim() || "0",
          standardMinutes: wcStandardMinutes.trim() || "0",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membuat work center");
      setNotice(`Work center ${wcCode.trim()} berhasil dibuat.`);
      setWcModalOpen(false);
      setWcCode("");
      setWcName("");
      setWcHourlyRate("0");
      setWcStandardMinutes("0");
      await load();
      if (json.data?.id) {
        setWorkCenterId(json.data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat work center");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Shop Floor & Manufacturing"
        title="Eksekusi Work Orders (WO)"
        description="Tetapkan work center, jalankan start/pause, catat waktu aktual, dan selesaikan output operasi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setWcModalOpen(true)}>
              + Work Center
            </Button>
            <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
              Muat ulang
            </Button>
          </div>
        }
      />

      <ManufacturingNav />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      {wcModalOpen ? (
        <Card>
          <CardHeader
            title="Tambah Work Center"
            description="Definisikan stasiun kerja, tarif tenaga kerja per jam, dan standar menit operasi."
          />
          <CardBody>
            <form className="space-y-4" onSubmit={handleCreateWorkCenter}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Kode work center" required>
                  <Input
                    placeholder="WC-ASSEMBLY-02"
                    required
                    value={wcCode}
                    onChange={(e) => setWcCode(e.target.value)}
                  />
                </Field>
                <Field label="Nama work center" required>
                  <Input
                    placeholder="Stasiun Perakitan 2"
                    required
                    value={wcName}
                    onChange={(e) => setWcName(e.target.value)}
                  />
                </Field>
                <Field label="Tarif per jam (Rp)" required hint="Dalam Rupiah">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={wcHourlyRate}
                    onChange={(e) => setWcHourlyRate(e.target.value)}
                  />
                </Field>
                <Field label="Standar menit" required hint="Estimasi waktu operasi">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={wcStandardMinutes}
                    onChange={(e) => setWcStandardMinutes(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" loading={saving} disabled={!wcCode || !wcName}>
                  {saving ? "Menyimpan…" : "Simpan Work Center"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setWcModalOpen(false);
                    setWcCode("");
                    setWcName("");
                  }}
                  disabled={saving}
                >
                  Batal
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {filters.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => {
              setFilter(entry);
              setPage(1);
            }}
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
          <CardHeader
            title="Daftar Work Orders (WO)"
            description={`${filtered.length} Work Orders ditampilkan.`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  value={search}
                  onChange={(val) => {
                    setSearch(val);
                    setPage(1);
                  }}
                  placeholder="Cari nomor WO, MO, atau operasi…"
                />
                {filtered.length > 0 ? (
                  <Button variant="secondary" size="sm" onClick={exportOrdersCsv}>
                    Ekspor CSV
                  </Button>
                ) : null}
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat Work Orders…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="Belum ada Work Orders"
                description={
                  search || filter !== "SEMUA"
                    ? "Tidak ada Work Order cocok dengan kriteria filter."
                    : "Rilis pesanan produksi terlebih dahulu di halaman Produksi."
                }
              />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th className="w-[120px]">Nomor WO</Th>
                      <Th className="w-[120px]">Nomor MO</Th>
                      <Th className="w-[110px]">Operasi</Th>
                      <Th className="w-[110px]">Work Center</Th>
                      <Th className="w-[90px]">Status</Th>
                      <Th align="right" className="w-[80px]">Target</Th>
                      <Th align="right" className="w-[80px]">Selesai</Th>
                      <Th align="right" className="w-[70px]">Reject</Th>
                      <Th align="right" className="w-[70px]">Menit</Th>
                      <Th align="right" className="w-[90px]">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedOrders.map((order) => (
                      <Tr key={order.id} className={selectedId === order.id ? "bg-brand-50/60" : undefined}>
                        <Td className="font-mono text-xs font-semibold text-brand-600 whitespace-nowrap">{order.number}</Td>
                        <Td className="font-mono text-xs text-slate-700 whitespace-nowrap">{order.manufacturingOrder.number}</Td>
                        <Td className="text-slate-800 text-xs font-medium whitespace-nowrap">{order.operationCode}</Td>
                        <Td className="font-mono text-xs text-slate-700 whitespace-nowrap">{order.workCenter?.code ?? "—"}</Td>
                        <Td className="whitespace-nowrap">{<StatusBadge status={order.status} />}</Td>
                        <Td align="right" className="tnum font-medium text-slate-900 text-xs whitespace-nowrap">{formatQuantity(order.targetQuantity)}</Td>
                        <Td align="right" className="tnum text-emerald-700 font-medium text-xs whitespace-nowrap">{formatQuantity(order.completedQty)}</Td>
                        <Td align="right" className="tnum text-rose-700 text-xs whitespace-nowrap">{formatQuantity(order.rejectedQty)}</Td>
                        <Td align="right" className="tnum text-slate-700 text-xs whitespace-nowrap">{formatQuantity(order.timeEntries.reduce((total, entry) => total.plus(entry.minutes), new Decimal(0)).toString())}</Td>
                        <Td align="right" className="whitespace-nowrap">
                          <Button variant="secondary" size="sm" onClick={() => selectOrder(order)}>
                            Kelola
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={page}
                  totalItems={filtered.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Kelola Work Order (WO)"
            description={selectedOrder ? `${selectedOrder.number} · ${selectedOrder.manufacturingOrder.item.sku}` : "Pilih Work Order dari tabel."}
          />
          <CardBody className="space-y-5">
            {!selectedOrder ? (
              <EmptyState compact title="Belum ada Work Order dipilih" description="Klik Kelola pada salah satu Work Order." />
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
                    <dd className="tnum text-slate-800">{formatDateTime(selectedOrder.startedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Selesai</dt>
                    <dd className="tnum text-slate-800">{formatDateTime(selectedOrder.completedAt)}</dd>
                  </div>
                </dl>

                {selectedOrder.status === "PENDING" || (selectedOrder.status === "IN_PROGRESS" && !selectedOrder.workCenter) ? (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
                    <Field label="Work center" required hint="Wajib untuk mencatat waktu dan biaya tenaga kerja.">
                      <Select value={workCenterId} onChange={(event) => setWorkCenterId(event.target.value)}>
                        <option value="">Pilih work center</option>
                        {workCenters.map((center) => (
                          <option key={center.id} value={center.id}>
                            {center.code} — {center.name} ({formatMoney(center.hourlyRate)}/jam)
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { void handleAssignWorkCenter(); }} loading={saving} disabled={!workCenterId}>
                        Tetapkan work center
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setWcModalOpen(true)}>
                        + Buat Work Center Baru
                      </Button>
                    </div>
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
                      <Field label="Catat waktu (menit)" required hint={!selectedOrder.workCenter ? "Wajib menetapkan work center terlebih dahulu." : undefined}>
                        <Input
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          required
                          disabled={!selectedOrder.workCenter}
                          value={minutes}
                          onChange={(event) => setMinutes(event.target.value)}
                        />
                      </Field>
                      {!selectedOrder.workCenter ? (
                        <p className="text-xs text-amber-700">
                          Work center belum ditetapkan. Tetapkan work center terlebih dahulu agar tarif tenaga kerja tercatat pada akuntansi biaya.
                        </p>
                      ) : null}
                      <Button type="submit" variant="secondary" size="sm" loading={saving} disabled={!selectedOrder.workCenter || !minutes}>
                        Simpan entri waktu
                      </Button>
                    </form>

                    <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={handleComplete}>
                      <Field label="Kuantitas selesai" required hint={`Sisa target: ${formatQuantity(remainingTarget.toString())}. Total selesai + reject tidak boleh melebihi sisa target.`}>
                        <Input
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          max={remainingTarget.toString()}
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
                          max={remainingTarget.toString()}
                          value={rejectedQty}
                          onChange={(event) => setRejectedQty(event.target.value)}
                        />
                      </Field>
                      <Button type="submit" variant="primary" size="sm" loading={saving}>
                        Selesaikan Work Order (WO)
                      </Button>
                    </form>
                  </>
                ) : null}

                {selectedOrder.status === "COMPLETED" ? (
                  <Alert tone="success">Work Order ini telah selesai. Output akan masuk ke antrean QC setelah seluruh operasi WO pada MO selesai.</Alert>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
