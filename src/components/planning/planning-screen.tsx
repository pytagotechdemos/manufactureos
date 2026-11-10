"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatQuantity, todayJakarta } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

type Permissions = {
  canReadDemands: boolean;
  canCreateDemand: boolean;
  canReleaseDemand: boolean;
  canRunMrp: boolean;
};

type Item = {
  id: string;
  sku: string;
  name: string;
  baseUom: { code: string };
};

type DemandLine = {
  id: string;
  itemId: string;
  quantity: string;
  requiredDate: string;
  item: Item;
};

type Demand = {
  id: string;
  number: string;
  status: "DRAFT" | "RELEASED" | "CANCELLED";
  createdAt: string;
  lines: DemandLine[];
};

type MrpRunSummary = {
  id: string;
  runNumber: string;
  status: string;
  asOfDate: string;
  createdAt: string;
  _count: { buckets: number; recommendations: number };
};

type MrpRecSource = {
  demandLine: { demand: { number: string } };
};

type MrpRecommendation = {
  id: string;
  itemId: string;
  supplyType: "BUY" | "MAKE";
  quantity: string;
  requiredDate: string;
  plannedReleaseDate: string;
  late: boolean;
  item: { sku: string; name: string; baseUom: { code: string } };
  sources: MrpRecSource[];
};

type MrpBucket = {
  id: string;
  itemId: string;
  bucketDate: string;
  grossRequirements: string;
  scheduledReceipts: string;
  projectedAvailable: string;
  netRequirements: string;
  item: { sku: string; name: string; baseUom: { code: string } };
};

type MrpRun = MrpRunSummary & {
  inputSnapshot: { horizonDays: number };
  buckets: MrpBucket[];
  recommendations: MrpRecommendation[];
};

type DemandLineDraft = {
  id: string;
  itemId: string;
  quantity: string;
  requiredDate: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const result = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Permintaan gagal");
  return result;
}

export function PlanningScreen({ permissions }: { permissions: Permissions }) {
  const [items, setItems] = useState<Item[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [runs, setRuns] = useState<MrpRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<MrpRun | null>(null);

  const [demandNumber, setDemandNumber] = useState("");
  const [demandLines, setDemandLines] = useState<DemandLineDraft[]>([
    { id: "1", itemId: "", quantity: "", requiredDate: todayJakarta() },
  ]);

  const [runNumber, setRunNumber] = useState("");
  const [asOfDate, setAsOfDate] = useState(todayJakarta());
  const [horizonDays, setHorizonDays] = useState("90");

  const [demandSearch, setDemandSearch] = useState("");
  const [demandPage, setDemandPage] = useState(1);
  const demandPageSize = 10;
  const [recPage, setRecPage] = useState(1);
  const recPageSize = 10;
  const [bucketPage, setBucketPage] = useState(1);
  const bucketPageSize = 15;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const jobs: Promise<unknown>[] = [];
      if (permissions.canReadDemands) {
        jobs.push(fetch("/api/v1/planning/demands?limit=100&offset=0", { cache: "no-store" }).then(readJson<{ data: Demand[]; page?: { total: number } }>));
      }
      if (permissions.canRunMrp) {
        jobs.push(fetch("/api/v1/planning/mrp-runs", { cache: "no-store" }).then(readJson<{ data: MrpRunSummary[] }>));
      }
      if (permissions.canCreateDemand || permissions.canRunMrp) {
        jobs.push(fetch("/api/v1/planning/master-data", { cache: "no-store" }).then(readJson<{ data: Item[] }>));
      }

      const results = await Promise.all(jobs);
      let index = 0;

      if (permissions.canReadDemands) {
        const demandFirstPage = results[index++] as { data: Demand[]; page?: { total: number } };
        const allDemands = [...(demandFirstPage.data ?? [])];
        const total = Number(demandFirstPage.page?.total ?? allDemands.length);
        const offsets = Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, pageIndex) => (pageIndex + 1) * 100);
        for (let pageIdx = 0; pageIdx < offsets.length; pageIdx += 10) {
          const pages = await Promise.all(
            offsets.slice(pageIdx, pageIdx + 10).map(async (offset) => {
              const res = await fetch(`/api/v1/planning/demands?limit=100&offset=${offset}`, { cache: "no-store" });
              return readJson<{ data: Demand[] }>(res);
            }),
          );
          allDemands.push(...pages.flatMap((page) => page.data ?? []));
        }
        setDemands(allDemands);
      }

      if (permissions.canRunMrp) {
        const runRes = results[index++] as { data: MrpRunSummary[] };
        setRuns(runRes.data ?? []);
      }

      if (permissions.canCreateDemand || permissions.canRunMrp) {
        const itemResult = results[index++] as { data: Item[] };
        const itemList = itemResult.data ?? [];
        setItems(itemList);
        setDemandLines((prev) =>
          prev.map((line) => (line.itemId ? line : { ...line, itemId: itemList[0]?.id ?? "" })),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat data perencanaan");
    } finally {
      setLoading(false);
    }
  }, [permissions.canCreateDemand, permissions.canReadDemands, permissions.canRunMrp]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredDemands = useMemo(() => {
    const needle = demandSearch.trim().toLowerCase();
    if (!needle) return demands;
    return demands.filter(
      (demand) =>
        demand.number.toLowerCase().includes(needle) ||
        demand.lines.some(
          (line) =>
            line.item.sku.toLowerCase().includes(needle) ||
            line.item.name.toLowerCase().includes(needle),
        ),
    );
  }, [demands, demandSearch]);

  const paginatedDemands = useMemo(() => {
    const start = (demandPage - 1) * demandPageSize;
    return filteredDemands.slice(start, start + demandPageSize);
  }, [filteredDemands, demandPage, demandPageSize]);

  function exportDemandsCsv() {
    downloadCsv(
      `permintaan-produksi-${todayJakarta()}.csv`,
      ["Nomor", "Barang (SKU)", "Status", "Tanggal"],
      demands.map((d) => [
        d.number,
        d.lines.map((l) => `${l.item.sku}: ${l.quantity}`).join("; "),
        d.status,
        d.createdAt.slice(0, 10),
      ]),
    );
  }

  const paginatedRecs = useMemo(() => {
    if (!selectedRun) return [];
    const start = (recPage - 1) * recPageSize;
    return selectedRun.recommendations.slice(start, start + recPageSize);
  }, [selectedRun, recPage, recPageSize]);

  const paginatedBuckets = useMemo(() => {
    if (!selectedRun) return [];
    const start = (bucketPage - 1) * bucketPageSize;
    return selectedRun.buckets.slice(start, start + bucketPageSize);
  }, [selectedRun, bucketPage, bucketPageSize]);

  function exportRecommendationsCsv() {
    if (!selectedRun) return;
    downloadCsv(
      `mrp-rekomendasi-${selectedRun.runNumber}-${todayJakarta()}.csv`,
      ["SKU", "Nama Barang", "Tipe Pengadaan", "Kuantitas", "Satuan", "Tanggal Dibutuhkan", "Rencana Rilis", "Status"],
      selectedRun.recommendations.map((r) => [
        r.item.sku,
        r.item.name,
        r.supplyType === "BUY" ? "Beli (PO)" : "Buat (MO)",
        r.quantity,
        r.item.baseUom.code,
        r.requiredDate,
        r.plannedReleaseDate,
        r.late ? "Terlambat" : "Tepat waktu",
      ]),
    );
  }

  function exportBucketsCsv() {
    if (!selectedRun) return;
    downloadCsv(
      `mrp-buckets-${selectedRun.runNumber}-${todayJakarta()}.csv`,
      ["Tanggal", "SKU", "Nama Barang", "Kebutuhan Kotor", "Jadwal Penerimaan", "Tersisa", "Kebutuhan Net"],
      selectedRun.buckets.map((b) => [
        b.bucketDate,
        b.item.sku,
        b.item.name,
        b.grossRequirements,
        b.scheduledReceipts,
        b.projectedAvailable,
        b.netRequirements,
      ]),
    );
  }

  function suggestDemandNumber() {
    const stamp = todayJakarta().replace(/-/g, "");
    return `DEM-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function suggestRunNumber() {
    const stamp = todayJakarta().replace(/-/g, "");
    return `MRP-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function addDemandLine() {
    setDemandLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        itemId: items[0]?.id ?? "",
        quantity: "",
        requiredDate: todayJakarta(),
      },
    ]);
  }

  function removeDemandLine(id: string) {
    setDemandLines((prev) => (prev.length > 1 ? prev.filter((line) => line.id !== id) : prev));
  }

  function updateDemandLine(id: string, field: keyof DemandLineDraft, value: string) {
    setDemandLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, [field]: value } : line)),
    );
  }

  async function createDemand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    for (const line of demandLines) {
      if (!line.itemId) {
        setError("Pilih barang untuk setiap baris permintaan.");
        setSubmitting(false);
        return;
      }
      try {
        const qty = new Decimal(line.quantity || "0");
        if (!qty.greaterThan(0)) {
          setError("Kuantitas setiap baris harus lebih besar dari 0.");
          setSubmitting(false);
          return;
        }
      } catch {
        setError("Format kuantitas tidak valid.");
        setSubmitting(false);
        return;
      }
      if (!line.requiredDate) {
        setError("Tanggal dibutuhkan wajib diisi untuk setiap baris.");
        setSubmitting(false);
        return;
      }
    }

    try {
      const payload = {
        number: demandNumber.trim() || suggestDemandNumber(),
        lines: demandLines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity.trim(),
          requiredDate: line.requiredDate,
        })),
      };
      await readJson(
        await fetch("/api/v1/planning/demands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setNotice(`Permintaan produksi ${payload.number} dibuat sebagai draf.`);
      setDemandNumber("");
      setDemandLines([{ id: "1", itemId: items[0]?.id ?? "", quantity: "", requiredDate: todayJakarta() }]);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membuat permintaan");
    } finally {
      setSubmitting(false);
    }
  }

  async function releaseDemand(id: string) {
    setReleasingId(id);
    setError(null);
    setNotice(null);
    try {
      await readJson(await fetch(`/api/v1/planning/demands/${id}/release`, { method: "POST" }));
      setNotice("Permintaan produksi dirilis untuk perencanaan MRP.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal merilis permintaan");
    } finally {
      setReleasingId(null);
    }
  }

  async function cancelDemand(id: string, number: string) {
    if (!window.confirm(`Batalkan permintaan produksi ${number}?`)) return;
    setReleasingId(id);
    setError(null);
    setNotice(null);
    try {
      await readJson(await fetch(`/api/v1/planning/demands/${id}/cancel`, { method: "POST" }));
      setNotice(`Permintaan produksi ${number} berhasil dibatalkan.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membatalkan permintaan");
    } finally {
      setReleasingId(null);
    }
  }

  async function runPlanning(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const payloadRunNumber = runNumber.trim() || suggestRunNumber();
      const response = await readJson<{ data: MrpRun }>(
        await fetch("/api/v1/planning/mrp-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runNumber: payloadRunNumber,
            asOfDate,
            horizonDays: Number(horizonDays),
          }),
        }),
      );
      setSelectedRun(response.data);
      setRecPage(1);
      setBucketPage(1);
      setNotice(`Run MRP ${response.data.runNumber} selesai dengan ${response.data.recommendations.length} rekomendasi.`);
      setRunNumber("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Run MRP gagal");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadRun(id: string) {
    setError(null);
    try {
      const result = await readJson<{ data: MrpRun }>(
        await fetch(`/api/v1/planning/mrp-runs/${id}`, { cache: "no-store" }),
      );
      setSelectedRun(result.data);
      setRecPage(1);
      setBucketPage(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat run MRP");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Supply Chain & Planning"
        title="Perencanaan & MRP"
        description="Kelola production demand, kalkulasi kebutuhan material MRP, dan terbitkan rekomendasi PO/MO."
        actions={
          <Button variant="secondary" onClick={() => { void refresh(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        {permissions.canCreateDemand ? (
          <Card>
            <CardHeader
              title="Buat permintaan produksi"
              description="Permintaan dibuat sebagai draf dan harus dirilis agar dihitung dalam run MRP."
            />
            <CardBody>
              <form className="space-y-4" onSubmit={createDemand}>
                <Field label="Nomor permintaan" hint="Kosongkan untuk nomor otomatis.">
                  <Input
                    placeholder={suggestDemandNumber()}
                    value={demandNumber}
                    onChange={(event) => setDemandNumber(event.target.value)}
                  />
                </Field>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Baris Barang & Kebutuhan ({demandLines.length})
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addDemandLine}
                      disabled={submitting || items.length === 0}
                    >
                      <Plus className="mr-1 size-3.5" />
                      Tambah baris
                    </Button>
                  </div>

                  {demandLines.map((line, idx) => (
                    <div
                      key={line.id}
                      className="grid items-end gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]"
                    >
                      <Field label={`Barang #${idx + 1}`} required>
                        <Select
                          required
                          value={line.itemId}
                          onChange={(e) => updateDemandLine(line.id, "itemId", e.target.value)}
                        >
                          <option value="">Pilih barang</option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.sku} · {item.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Kuantitas" required>
                        <Input
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          required
                          placeholder="1"
                          value={line.quantity}
                          onChange={(e) => updateDemandLine(line.id, "quantity", e.target.value)}
                        />
                      </Field>
                      <Field label="Tanggal dibutuhkan" required>
                        <Input
                          type="date"
                          min={todayJakarta()}
                          required
                          value={line.requiredDate}
                          onChange={(e) => updateDemandLine(line.id, "requiredDate", e.target.value)}
                        />
                      </Field>
                      <div className="flex justify-end pb-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={demandLines.length <= 1}
                          onClick={() => removeDemandLine(line.id)}
                          aria-label="Hapus baris"
                        >
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={loading || items.length === 0}
                >
                  {submitting ? "Menyimpan…" : "Buat draf permintaan"}
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}

        {permissions.canRunMrp ? (
          <Card>
            <CardHeader
              title="Jalankan perencanaan bahan baku (MRP)"
              description="Menghitung kebutuhan kotor, stok tersedia, BOM hierarkis, dan saldo PO berhari."
            />
            <CardBody>
              <form className="space-y-4" onSubmit={runPlanning}>
                <Field label="Nomor run MRP" hint="Kosongkan untuk nomor otomatis.">
                  <Input
                    placeholder={suggestRunNumber()}
                    value={runNumber}
                    onChange={(event) => setRunNumber(event.target.value)}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tanggal acuan (As Of Date)" required>
                    <Input
                      type="date"
                      required
                      value={asOfDate}
                      onChange={(event) => setAsOfDate(event.target.value)}
                    />
                  </Field>
                  <Field label="Horizon perencanaan (Hari)" required>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      required
                      value={horizonDays}
                      onChange={(event) => setHorizonDays(event.target.value)}
                    />
                  </Field>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={loading}
                >
                  {submitting ? "Menghitung…" : "Jalankan MRP"}
                </Button>
                <p className="text-[12px] text-slate-500">
                  Rekomendasi disimpan sebagai referensi. Buat pesanan produksi (MO) atau pesanan pembelian (PO) langsung dari hasil rekomendasi di bawah.
                </p>
              </form>
            </CardBody>
          </Card>
        ) : null}
      </div>

      {permissions.canReadDemands ? (
        <Card>
          <CardHeader
            title="Daftar Permintaan Produksi"
            description={`${filteredDemands.length} dari ${demands.length} permintaan.`}
            actions={
              <div className="flex items-center gap-2">
                <SearchInput
                  value={demandSearch}
                  onChange={(v) => { setDemandSearch(v); setDemandPage(1); }}
                  placeholder="Cari nomor atau SKU barang…"
                />
                <Button variant="secondary" size="sm" onClick={exportDemandsCsv} disabled={demands.length === 0}>
                  Ekspor CSV
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat permintaan produksi…</div>
            ) : filteredDemands.length === 0 ? (
              <EmptyState
                title="Belum ada permintaan produksi"
                description="Buat permintaan produksi baru untuk memulai siklus perencanaan."
              />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th>Nomor</Th>
                      <Th>Baris Barang</Th>
                      <Th>Kebutuhan Paling Awal</Th>
                      <Th>Status</Th>
                      <Th align="right">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedDemands.map((demand) => {
                      const earliestDate = demand.lines[0]
                        ? demand.lines
                            .map((line) => line.requiredDate)
                            .sort()[0]
                        : null;
                      return (
                        <Tr key={demand.id}>
                          <Td className="font-medium tnum">{demand.number}</Td>
                          <Td className="text-slate-600">
                            {demand.lines.map((line) => `${line.item.sku}: ${formatQuantity(line.quantity)}`).join(", ")}
                          </Td>
                          <Td className="tnum text-slate-600">{earliestDate ? formatDate(earliestDate) : "—"}</Td>
                          <Td>{<StatusBadge status={demand.status} />}</Td>
                          <Td align="right">
                            {(demand.status === "DRAFT" || demand.status === "RELEASED") && (permissions.canReleaseDemand || permissions.canCreateDemand) ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {demand.status === "DRAFT" && permissions.canReleaseDemand && (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    loading={releasingId === demand.id}
                                    onClick={() => void releaseDemand(demand.id)}
                                  >
                                    Rilis
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="text-red-600 hover:text-red-700"
                                  loading={releasingId === demand.id}
                                  onClick={() => void cancelDemand(demand.id, demand.number)}
                                >
                                  Batal
                                </Button>
                              </div>
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
                  currentPage={demandPage}
                  pageSize={demandPageSize}
                  totalItems={filteredDemands.length}
                  onPageChange={setDemandPage}
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      {permissions.canRunMrp ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
          <Card>
            <CardHeader
              title="Riwayat Run MRP"
              description="Pilih run tersimpan untuk meninjau hasil."
            />
            <CardBody className="p-0">
              {runs.length === 0 ? (
                <EmptyState compact title="Belum ada run perencanaan" />
              ) : (
                <div className="divide-y divide-slate-100">
                  {runs.map((run) => (
                    <button
                      className={`block w-full px-5 py-3.5 text-left transition-colors hover:bg-slate-50 ${
                        selectedRun?.id === run.id ? "bg-blue-50/70 border-l-4 border-blue-600" : ""
                      }`}
                      key={run.id}
                      onClick={() => void loadRun(run.id)}
                      type="button"
                    >
                      <p className="font-semibold text-slate-900 tnum">{run.runNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Acuan {formatDate(run.asOfDate)} · {run._count.recommendations} rekomendasi · {run._count.buckets} bucket
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={selectedRun ? `Hasil · ${selectedRun.runNumber}` : "Hasil MRP"}
              description={
                selectedRun
                  ? `Horizon ${selectedRun.inputSnapshot.horizonDays} hari · ${selectedRun.recommendations.length} rekomendasi ditemukan.`
                  : "Pilih run dari daftar sebelah kiri atau jalankan MRP baru."
              }
            />
            <CardBody className="p-0">
              {!selectedRun ? (
                <EmptyState
                  compact
                  title="Pilih run MRP"
                  description="Jalankan perencanaan atau klik salah satu run dari riwayat di samping."
                />
              ) : (
                <div className="space-y-6 p-5">
                  <div>
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">Rekomendasi Pengadaan & Produksi</h3>
                        <span className="text-xs text-slate-500">
                          ({selectedRun.recommendations.length} item)
                        </span>
                      </div>
                      {selectedRun.recommendations.length > 0 ? (
                        <Button variant="secondary" size="sm" onClick={exportRecommendationsCsv}>
                          Ekspor CSV
                        </Button>
                      ) : null}
                    </div>

                    {selectedRun.recommendations.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-500">
                        Semua kebutuhan net terpenuhi oleh stok dan jadwal penerimaan saat ini.
                      </p>
                    ) : (
                      <>
                        <div className="mt-3 overflow-x-auto">
                          <Table>
                            <TableHead>
                              <Tr>
                                <Th>Barang</Th>
                                <Th>Tipe</Th>
                                <Th align="right">Kuantitas</Th>
                                <Th>Dibutuhkan</Th>
                                <Th>Rencana Rilis</Th>
                                <Th>Status</Th>
                                <Th align="right">Aksi</Th>
                              </Tr>
                            </TableHead>
                            <TableBody>
                              {paginatedRecs.map((recommendation) => (
                                <Tr key={recommendation.id}>
                                  <Td className="font-medium tnum">
                                    {recommendation.item.sku}
                                    <span className="block text-xs font-normal text-slate-500">
                                      {recommendation.item.name}
                                    </span>
                                  </Td>
                                  <Td>
                                    <span
                                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                                        recommendation.supplyType === "MAKE"
                                          ? "bg-purple-50 text-purple-700 border border-purple-200"
                                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      }`}
                                    >
                                      {recommendation.supplyType === "BUY" ? "Beli (PO)" : "Buat (MO)"}
                                    </span>
                                  </Td>
                                  <Td align="right" className="tnum font-medium text-slate-800">
                                    {formatQuantity(recommendation.quantity)} {recommendation.item.baseUom.code}
                                  </Td>
                                  <Td className="tnum text-slate-600">{formatDate(recommendation.requiredDate)}</Td>
                                  <Td className="tnum text-slate-600">{formatDate(recommendation.plannedReleaseDate)}</Td>
                                  <Td>
                                    {recommendation.late ? (
                                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                                        Terlambat
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-500">Tepat waktu</span>
                                    )}
                                  </Td>
                                  <Td align="right">
                                    {recommendation.supplyType === "MAKE" ? (
                                      <Link
                                        href={`/manufacturing?runId=${selectedRun.id}&recId=${recommendation.id}`}
                                        className="inline-flex items-center text-xs font-semibold text-brand-600 hover:underline"
                                      >
                                        Buat MO &rarr;
                                      </Link>
                                    ) : (
                                      <Link
                                        href={`/procurement?tab=orders&itemId=${recommendation.itemId}&quantity=${recommendation.quantity}`}
                                        className="inline-flex items-center text-xs font-semibold text-brand-600 hover:underline"
                                      >
                                        Buat PO &rarr;
                                      </Link>
                                    )}
                                  </Td>
                                </Tr>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <Pagination
                          currentPage={recPage}
                          pageSize={recPageSize}
                          totalItems={selectedRun.recommendations.length}
                          onPageChange={setRecPage}
                        />
                      </>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">Buckets Kebutuhan Berhari</h3>
                        <span className="text-xs text-slate-500">({selectedRun.buckets.length} catatan)</span>
                      </div>
                      {selectedRun.buckets.length > 0 ? (
                        <Button variant="secondary" size="sm" onClick={exportBucketsCsv}>
                          Ekspor CSV
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-3 overflow-x-auto">
                      <Table>
                        <TableHead>
                          <Tr>
                            <Th>Tanggal</Th>
                            <Th>Barang</Th>
                            <Th align="right">Kotor</Th>
                            <Th align="right">Penerimaan</Th>
                            <Th align="right">Tersisa</Th>
                            <Th align="right">Kebutuhan Net</Th>
                          </Tr>
                        </TableHead>
                        <TableBody>
                          {paginatedBuckets.map((bucket) => (
                            <Tr key={bucket.id}>
                              <Td className="tnum text-slate-600">{formatDate(bucket.bucketDate)}</Td>
                              <Td className="font-medium tnum">{bucket.item.sku}</Td>
                              <Td align="right" className="tnum text-slate-600">{formatQuantity(bucket.grossRequirements)}</Td>
                              <Td align="right" className="tnum text-slate-600">{formatQuantity(bucket.scheduledReceipts)}</Td>
                              <Td align="right" className="tnum text-slate-600">{formatQuantity(bucket.projectedAvailable)}</Td>
                              <Td align="right" className="tnum font-semibold text-slate-900">{formatQuantity(bucket.netRequirements)}</Td>
                            </Tr>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Pagination
                      currentPage={bucketPage}
                      pageSize={bucketPageSize}
                      totalItems={selectedRun.buckets.length}
                      onPageChange={setBucketPage}
                    />
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
