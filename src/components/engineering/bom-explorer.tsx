"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  requirements: Array<{ itemId: string; quantity: string; uom: string }>;
};

const statusLabels: Record<BomSummary["status"], string> = {
  DRAFT: "Draf",
  IN_REVIEW: "Ditinjau",
  APPROVED: "Disetujui",
  OBSOLETE: "Kedaluwarsa",
};

function statusClass(status: BomSummary["status"]) {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "IN_REVIEW") return "bg-amber-50 text-amber-700";
  if (status === "OBSOLETE") return "bg-slate-100 text-slate-500";
  return "bg-blue-50 text-blue-700";
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
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

  const loadBoms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const result = await readJson<{ data: BomSummary[] }>(await fetch(`/api/v1/boms?${params}`));
      setBoms(result.data);
      if (selectedId && !result.data.some((bom) => bom.id === selectedId)) {
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
      const result = await readJson<{ data: Explosion }>(await fetch(`/api/v1/boms/${selectedId}/explosion?quantity=${encodeURIComponent(quantity)}`));
      setExplosion(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menghitung esplosi");
    } finally {
      setActionLoading(false);
    }
  }

  async function performAction(action: "submit-review" | "approve" | "obsolete") {
    if (!selectedId) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      await readJson(await fetch(`/api/v1/boms/${selectedId}/${action}`, { method: "POST" }));
      setNotice(`BOM ${action === "submit-review" ? "diajukan tinjauan" : action === "approve" ? "disetujui" : "kedaluwarsa"} selesai.`);
      await loadBoms();
      await selectBom(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Aksi gagal");
    } finally {
      setActionLoading(false);
    }
  }

  const selectedStatus = detail?.status;
  const canSubmit = selectedStatus === "DRAFT";
  const canApproveAction = selectedStatus === "IN_REVIEW";
  const canObsolete = selectedStatus === "APPROVED";
  const formattedDate = useMemo(() => detail?.effectiveDate ? new Date(detail.effectiveDate).toLocaleDateString("id-ID") : "Belum ditetapkan", [detail?.effectiveDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-blue-700">Teknik</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Eksplorasi BOM</h1>
          <p className="mt-2 text-sm text-slate-600">Tinjau revisi, periksa struktur komponen, dan hitung kebutuhan bahan baku.</p>
        </div>
        <div className="flex gap-2">
          <input aria-label="Cari BOM" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Cari BOM atau barang" value={search} />
          <select aria-label="Filter status BOM" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">Semua status</option>
            <option value="DRAFT">Draf</option>
            <option value="IN_REVIEW">Ditinjau</option>
            <option value="APPROVED">Disetujui</option>
            <option value="OBSOLETE">Kedaluwarsa</option>
          </select>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Revisi BOM</h2>
              <span className="text-xs text-slate-500">{boms.length} ditampilkan</span>
            </div>
          </div>
          {loading ? <p className="px-5 py-8 text-sm text-slate-500">Memuat BOM…</p> : boms.length === 0 ? <p className="px-5 py-8 text-sm text-slate-500">Tidak ada revisi BOM yang cocok dengan filter saat ini.</p> : (
            <div className="divide-y divide-slate-100">
              {boms.map((bom) => (
                <button className={`block w-full px-5 py-4 text-left transition hover:bg-slate-50 ${selectedId === bom.id ? "bg-blue-50/60" : ""}`} key={bom.id} onClick={() => void selectBom(bom.id)} type="button">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{bom.outputItem.sku} · {bom.outputItem.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{bom.number} · Revisi {bom.revision}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(bom.status)}`}>{statusLabels[bom.status]}</span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Output {bom.outputQty} · {bom._count.lines} komponen</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          {detailLoading ? <p className="px-5 py-8 text-sm text-slate-500">Memuat detail BOM…</p> : !detail ? <div className="px-5 py-12 text-center"><p className="font-medium text-slate-700">Pilih revisi BOM</p><p className="mt-2 text-sm text-slate-500">Metadata revisi dan pohon komponen akan muncul di sini.</p></div> : (
            <>
              <div className="border-b border-slate-200 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><p className="text-sm text-slate-500">{detail.number} · Revisi {detail.revision}</p><h2 className="mt-1 text-xl font-semibold">{detail.outputItem.sku} · {detail.outputItem.name}</h2></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(detail.status)}`}>{statusLabels[detail.status]}</span>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><div><dt className="text-slate-500">Output</dt><dd className="mt-1 font-medium">{detail.outputQty} {detail.outputItem.baseUom.code}</dd></div><div><dt className="text-slate-500">Efektif</dt><dd className="mt-1 font-medium">{formattedDate}</dd></div><div><dt className="text-slate-500">Komponen</dt><dd className="mt-1 font-medium">{detail.lines.length}</dd></div><div><dt className="text-slate-500">Persetujuan</dt><dd className="mt-1 font-medium">{detail.approvedAt ? new Date(detail.approvedAt).toLocaleDateString("id-ID") : "Belum disetujui"}</dd></div></dl>
              </div>
              <div className="border-b border-slate-200 px-5 py-4"><div className="flex flex-wrap gap-2">{canCreate ? <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50" disabled={!canSubmit || actionLoading} onClick={() => void performAction("submit-review")} type="button">Ajukan tinjauan</button> : null}{canApprove ? <button className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!canApproveAction || actionLoading} onClick={() => void performAction("approve")} type="button">Setujui</button> : null}{canApprove ? <button className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50" disabled={!canObsolete || actionLoading} onClick={() => void performAction("obsolete")} type="button">Kedaluwarsa</button> : null}</div></div>
              <div className="px-5 py-5"><h3 className="font-semibold">Komponen</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 pr-4">Urut</th><th className="pb-3 pr-4">Komponen</th><th className="pb-3 pr-4">Tipe</th><th className="pb-3 pr-4">Kuantitas</th><th className="pb-3">Sisa</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.lines.map((line) => <tr key={line.id}><td className="py-3 pr-4 text-slate-500">{line.sequence}</td><td className="py-3 pr-4"><p className="font-medium">{line.component.sku}</p><p className="text-xs text-slate-500">{line.component.name}</p></td><td className="py-3 pr-4"><span className={`rounded px-2 py-1 text-xs ${line.component.supplyType === "MAKE" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{line.component.supplyType === "MAKE" ? "Buat sendiri" : "Beli"}</span></td><td className="py-3 pr-4">{line.quantity} {line.uom.code}</td><td className="py-3">{line.scrapRate}</td></tr>)}</tbody></table></div></div>
              <div className="border-t border-slate-200 px-5 py-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold">Esplosi</h3><p className="mt-1 text-sm text-slate-500">Hitung kebutuhan bahan baku daun untuk jumlah output yang diminta.</p></div><div className="flex gap-2"><input aria-label="Kuantitas esplosi" className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm" min="0.000001" onChange={(event) => setQuantity(event.target.value)} step="any" type="number" value={quantity} /><button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={actionLoading} onClick={() => void runExplosion()} type="button">Hitung</button></div></div>{explosion ? <div className="mt-4 rounded-md bg-slate-50 p-4"><div className="grid gap-2 text-sm">{explosion.requirements.map((requirement) => <div className="flex justify-between gap-4" key={`${requirement.itemId}-${requirement.uom}`}><span className="font-mono text-xs text-slate-600">{requirement.itemId}</span><span className="font-medium">{requirement.quantity} {requirement.uom}</span></div>)}</div></div> : <p className="mt-4 text-sm text-slate-500">Belum dihitung esplosi.</p>}</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
