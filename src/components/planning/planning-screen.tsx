"use client";

import { useCallback, useEffect, useState } from "react";

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

async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Permintaan gagal");
  return result;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function PlanningScreen({ permissions }: { permissions: Permissions }) {
  const [items, setItems] = useState<Item[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [runs, setRuns] = useState<MrpRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<MrpRun | null>(null);
  const [demandNumber, setDemandNumber] = useState("");
  const [demandItemId, setDemandItemId] = useState("");
  const [demandQuantity, setDemandQuantity] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [runNumber, setRunNumber] = useState("");
  const [asOfDate, setAsOfDate] = useState(today());
  const [horizonDays, setHorizonDays] = useState("90");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const jobs: Promise<unknown>[] = [];
      if (permissions.canReadDemands) jobs.push(fetch("/api/v1/planning/demands", { cache: "no-store" }).then(readJson<{ data: Demand[] }>));
      if (permissions.canRunMrp) {
        jobs.push(fetch("/api/v1/planning/mrp-runs", { cache: "no-store" }).then(readJson<{ data: MrpRunSummary[] }>));
        jobs.push(fetch("/api/v1/planning/master-data", { cache: "no-store" }).then(readJson<{ data: Item[] }>));
      }
      const results = await Promise.all(jobs);
      let index = 0;
      if (permissions.canReadDemands) setDemands((results[index++] as { data: Demand[] }).data);
      if (permissions.canRunMrp) {
        setRuns((results[index++] as { data: MrpRunSummary[] }).data);
        const itemResult = results[index++] as { data: Item[] };
        setItems(itemResult.data);
        if (!demandItemId && itemResult.data[0]) setDemandItemId(itemResult.data[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal memuat data perencanaan");
    } finally {
      setLoading(false);
    }
  }, [demandItemId, permissions.canReadDemands, permissions.canRunMrp]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createDemand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await readJson(await fetch("/api/v1/planning/demands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: demandNumber, lines: [{ itemId: demandItemId, quantity: demandQuantity, requiredDate }] }),
      }));
      setNotice("Permintaan produksi dibuat sebagai draf.");
      setDemandNumber("");
      setDemandQuantity("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membuat permintaan");
    } finally { setSubmitting(false); }
  }

  async function releaseDemand(id: string) {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await readJson(await fetch(`/api/v1/planning/demands/${id}/release`, { method: "POST" }));
      setNotice("Permintaan produksi dirilis untuk perencanaan.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal merilis permintaan"); }
    finally { setSubmitting(false); }
  }

  async function runPlanning(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await readJson<{ data: MrpRun }>(await fetch("/api/v1/planning/mrp-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runNumber, asOfDate, horizonDays: Number(horizonDays) }),
      }));
      setSelectedRun(response.data);
      setNotice(`Run MRP selesai dengan ${response.data.recommendations.length} rekomendasi.`);
      setRunNumber("");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Run MRP gagal"); }
    finally { setSubmitting(false); }
  }

  async function loadRun(id: string) {
    setError(null);
    try {
      const result = await readJson<{ data: MrpRun }>(await fetch(`/api/v1/planning/mrp-runs/${id}`, { cache: "no-store" }));
      setSelectedRun(result.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat run MRP"); }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-blue-700">Perencanaan</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Permintaan & MRP</h1>
        <p className="mt-2 text-sm text-slate-600">Rilis permintaan produksi berhari, hitung kebutuhan bahan baku net, dan tinjau riwayat run yang tersimpan.</p>
      </header>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {permissions.canCreateDemand ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Buat permintaan produksi</h2>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={createDemand}>
              <label className="text-sm font-medium">Nomor permintaan
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setDemandNumber(event.target.value)} required value={demandNumber} />
              </label>
              <label className="text-sm font-medium">Barang
                <select className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2" onChange={(event) => setDemandItemId(event.target.value)} required value={demandItemId}>
                  <option value="">Pilih barang</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">Kuantitas
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min="0.000001" onChange={(event) => setDemandQuantity(event.target.value)} required step="any" type="number" value={demandQuantity} />
              </label>
              <label className="text-sm font-medium">Tanggal dibutuhkan
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" min={today()} onChange={(event) => setRequiredDate(event.target.value)} required type="date" value={requiredDate} />
              </label>
              <button className="rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2" disabled={submitting || loading || items.length === 0} type="submit">
                {submitting ? "Menyimpan…" : "Buat draf permintaan"}
              </button>
            </form>
          </section>
        ) : null}

        {permissions.canRunMrp ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Jalankan perencanaan bahan baku</h2>
            <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={runPlanning}>
              <label className="text-sm font-medium sm:col-span-3">Nomor run
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setRunNumber(event.target.value)} required value={runNumber} />
              </label>
              <label className="text-sm font-medium">Tanggal acuan
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setAsOfDate(event.target.value)} required type="date" value={asOfDate} />
              </label>
              <label className="text-sm font-medium">Hari horizon
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" max="365" min="1" onChange={(event) => setHorizonDays(event.target.value)} required type="number" value={horizonDays} />
              </label>
              <div className="flex items-end">
                <button className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={submitting || loading} type="submit">
                  {submitting ? "Menghitung…" : "Jalankan MRP"}
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-slate-500">Menggunakan permintaan yang dirilis, stok tersedia saat ini, BOM efektif yang disetujui, dan saldo PO berhari. Rekomendasi disimpan; tidak ada dokumen pembelian yang dibuat secara otomatis.</p>
          </section>
        ) : null}
      </div>

      {permissions.canReadDemands ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Permintaan produksi</h2></div>
          {loading ? (
            <p className="px-5 py-6 text-sm text-slate-500">Memuat permintaan…</p>
          ) : demands.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Belum ada permintaan produksi yang tercatat.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Nomor</th>
                    <th className="px-4 py-3">Baris</th>
                    <th className="px-4 py-3">Kebutuhan paling awal</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {demands.map((demand) => (
                    <tr key={demand.id}>
                      <td className="px-5 py-3 font-medium">{demand.number}</td>
                      <td className="px-4 py-3">{demand.lines.map((line) => `${line.item.sku}: ${line.quantity}`).join(", ")}</td>
                      <td className="px-4 py-3">{demand.lines.map((line) => line.requiredDate.slice(0, 10)).sort()[0]}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-1 text-xs ${demand.status === "RELEASED" ? "bg-emerald-50 text-emerald-700" : demand.status === "CANCELLED" ? "bg-slate-100 text-slate-500" : "bg-blue-50 text-blue-700"}`}>
                          {demand.status === "DRAFT" ? "Draf" : demand.status === "RELEASED" ? "Dirilis" : "Dibatalkan"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {demand.status === "DRAFT" && permissions.canReleaseDemand ? (
                          <button className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50" disabled={submitting} onClick={() => void releaseDemand(demand.id)} type="button">
                            Rilis
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {permissions.canRunMrp ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(280px,0.6fr)_minmax(0,1.4fr)]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Riwayat run MRP</h2></div>
            {runs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Belum ada run perencanaan.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <button className={`block w-full px-5 py-4 text-left hover:bg-slate-50 ${selectedRun?.id === run.id ? "bg-blue-50" : ""}`} key={run.id} onClick={() => void loadRun(run.id)} type="button">
                    <p className="font-medium">{run.runNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">Pada {run.asOfDate.slice(0, 10)} · {run._count.recommendations} rekomendasi</p>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">{selectedRun ? `Hasil · ${selectedRun.runNumber}` : "Hasil MRP"}</h2>
            </div>
            {!selectedRun ? (
              <p className="px-5 py-6 text-sm text-slate-500">Jalankan perencanaan atau pilih run yang tersimpan.</p>
            ) : (
              <div className="space-y-6 p-5">
                <div>
                  <h3 className="font-medium">Rekomendasi</h3>
                  {selectedRun.recommendations.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">Tidak ada kebutuhan net yang ditemukan dalam run ini.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b text-xs uppercase text-slate-500">
                          <tr>
                            <th className="pb-2 pr-3">Barang</th>
                            <th className="pb-2 pr-3">Tipe</th>
                            <th className="pb-2 pr-3 text-right">Kuantitas</th>
                            <th className="pb-2 pr-3">Dibutuhkan</th>
                            <th className="pb-2 pr-3">Rilis</th>
                            <th className="pb-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedRun.recommendations.map((recommendation) => (
                            <tr key={recommendation.id}>
                              <td className="py-2 pr-3">{recommendation.item.sku} · {recommendation.item.name}</td>
                              <td className="py-2 pr-3">{recommendation.supplyType === "BUY" ? "Beli" : "Buat sendiri"}</td>
                              <td className="py-2 pr-3 text-right">{recommendation.quantity} {recommendation.item.baseUom.code}</td>
                              <td className="py-2 pr-3">{recommendation.requiredDate.slice(0, 10)}</td>
                              <td className="py-2 pr-3">{recommendation.plannedReleaseDate.slice(0, 10)}</td>
                              <td className="py-2">
                                {recommendation.late ? <span className="font-medium text-red-700">Terlambat</span> : "Tepat waktu"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-medium">Buckets berhari</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b text-xs uppercase text-slate-500">
                        <tr>
                          <th className="pb-2 pr-3">Tanggal</th>
                          <th className="pb-2 pr-3">Barang</th>
                          <th className="pb-2 pr-3 text-right">Kotor</th>
                          <th className="pb-2 pr-3 text-right">Terima</th>
                          <th className="pb-2 pr-3 text-right">Tersisa</th>
                          <th className="pb-2 pr-3 text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedRun.buckets.map((bucket) => (
                          <tr key={bucket.id}>
                            <td className="py-2 pr-3">{bucket.bucketDate.slice(0, 10)}</td>
                            <td className="py-2 pr-3">{bucket.item.sku}</td>
                            <td className="py-2 pr-3 text-right">{bucket.grossRequirements}</td>
                            <td className="py-2 pr-3 text-right">{bucket.scheduledReceipts}</td>
                            <td className="py-2 pr-3 text-right">{bucket.projectedAvailable}</td>
                            <td className="py-2 pr-3 text-right">{bucket.netRequirements}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
