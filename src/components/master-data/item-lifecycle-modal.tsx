"use client";

import { useEffect, useState } from "react";
import { X, History, Layers, Package, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge, type Tone, StatusBadge, humanize } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatMoney, formatQuantity, todayJakarta } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface StockBalanceEntry {
  id: string;
  onHand: string;
  reserved: string;
  blocked: string;
  onHandValue: string;
  averageUnitCost: string | null;
  valuationComplete: boolean;
  warehouse: {
    id: string;
    code: string;
    name: string;
  };
}

interface BomOutputEntry {
  id: string;
  number: string;
  revision: string;
  status: string;
  effectiveDate: string | null;
  outputQty: string;
}

interface BomComponentEntry {
  id: string;
  sequence: number;
  quantity: string;
  scrapRate: string;
  uom: { code: string };
  bom: {
    id: string;
    number: string;
    revision: string;
    status: string;
    outputItem: { id: string; sku: string; name: string };
  };
}

interface ItemDetailData {
  item: {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    itemType: string;
    supplyType: string;
    status: string;
    standardMaterialCost: string | null;
    reorderPoint: string;
    safetyStock: string;
    purchasingLeadDays: number;
    minimumOrderQty: string;
    lotSizeMultiple: string;
    createdAt: string;
    updatedAt: string;
    category: { id: string; code: string; name: string } | null;
    baseUom: { id: string; code: string; name: string; dimension: string } | null;
    stockBalances: StockBalanceEntry[];
    bomOutputs: BomOutputEntry[];
    bomComponents: BomComponentEntry[];
  };
  auditLogs: AuditLogEntry[];
}

const actionLabels: Record<string, { label: string; tone: Tone }> = {
  "item.created": { label: "Barang Dibuat", tone: "info" },
  "item.updated": { label: "Data Diperbarui", tone: "warning" },
  "item.activated": { label: "Diaktifkan", tone: "success" },
  "item.deactivated": { label: "Dinonaktifkan", tone: "danger" },
};

export function ItemLifecycleModal({
  itemId,
  itemSku,
  onClose,
}: {
  itemId: string;
  itemSku: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"audit" | "inventory" | "bom">("audit");
  const [data, setData] = useState<ItemDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchDetail() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/items/${itemId}`);
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat detail barang");
        if (!cancelled) {
          setData(json.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat detail barang");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  function exportAuditCsv() {
    if (!data) return;
    downloadCsv(
      `audit-siklus-hidup-${data.item.sku}-${todayJakarta()}.csv`,
      ["Waktu (WIB)", "Aksi", "Aktor", "Email Aktor", "Sumber", "Detail Perubahan"],
      data.auditLogs.map((log) => {
        const metadata = log.metadata ?? {};
        const changes = (metadata.changes as Record<string, { from: unknown; to: unknown }>) ?? null;
        let changeText = "";
        if (changes && typeof changes === "object") {
          changeText = Object.entries(changes)
            .map(([field, delta]) => `${field}: ${String(delta.from ?? "—")} → ${String(delta.to ?? "—")}`)
            .join("; ");
        } else if (metadata.updatedFields && Array.isArray(metadata.updatedFields)) {
          changeText = `Field diubah: ${metadata.updatedFields.join(", ")}`;
        }
        return [
          formatDateTime(log.createdAt),
          actionLabels[log.action]?.label ?? log.action,
          log.actor?.name ?? "Sistem",
          log.actor?.email ?? "—",
          log.source ?? "—",
          changeText,
        ];
      }),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 bg-slate-50/75">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Siklus Hidup & Audit Log Barang
              </span>
              {data ? <StatusBadge status={data.item.status} /> : null}
            </div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="font-mono text-brand-600">{data?.item.sku ?? itemSku}</span>
              {data?.item.name ? <span>— {data.item.name}</span> : null}
            </h2>
            {data ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-0.5">
                <span>Kategori: <strong className="text-slate-700">{data.item.category?.name ?? "—"}</strong></span>
                <span>•</span>
                <span>Satuan Dasar: <strong className="text-slate-700">{data.item.baseUom?.code ?? "—"}</strong></span>
                <span>•</span>
                <span>Tipe: <strong className="text-slate-700">{humanize(data.item.itemType)}</strong></span>
                <span>•</span>
                <span>Pengadaan: <strong className="text-slate-700">{humanize(data.item.supplyType)}</strong></span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 pt-2 bg-slate-50/40">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setTab("audit")}
              className={`flex items-center gap-1.5 pb-2.5 text-sm font-semibold border-b-2 transition ${
                tab === "audit"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <History className="size-4" />
              Riwayat Audit ({data?.auditLogs.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setTab("inventory")}
              className={`flex items-center gap-1.5 pb-2.5 text-sm font-semibold border-b-2 transition ${
                tab === "inventory"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Package className="size-4" />
              Saldo Persediaan ({data?.item.stockBalances.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setTab("bom")}
              className={`flex items-center gap-1.5 pb-2.5 text-sm font-semibold border-b-2 transition ${
                tab === "bom"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Layers className="size-4" />
              Keterkaitan BOM ({((data?.item.bomOutputs.length ?? 0) + (data?.item.bomComponents.length ?? 0))})
            </button>
          </div>

          {tab === "audit" && data && data.auditLogs.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={exportAuditCsv}
              className="mb-2"
              title="Unduh log audit siklus hidup sebagai CSV"
            >
              <Download className="size-3.5" />
              Ekspor CSV
            </Button>
          ) : null}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          {loading ? (
            <div className="py-12 text-center text-slate-500">Memuat data siklus hidup…</div>
          ) : !data ? (
            <EmptyState title="Data tidak ditemukan" description="Detail barang tidak dapat dimuat." />
          ) : tab === "audit" ? (
            <div>
              {data.auditLogs.length === 0 ? (
                <EmptyState
                  title="Belum ada riwayat audit"
                  description="Aktivitas pembuatan dan modifikasi barang akan tercatat otomatis di sini."
                />
              ) : (
                <Table>
                  <TableHead>
                    <Tr>
                      <Th>Waktu (WIB)</Th>
                      <Th>Aksi</Th>
                      <Th>Aktor</Th>
                      <Th>Sumber</Th>
                      <Th>Rincian Perubahan</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {data.auditLogs.map((log) => {
                      const meta = log.metadata ?? {};
                      const changes = (meta.changes as Record<string, { from: unknown; to: unknown }>) ?? null;
                      const actionInfo = actionLabels[log.action] ?? { label: humanize(log.action), tone: "neutral" as const };

                      return (
                        <Tr key={log.id}>
                          <Td className="tnum whitespace-nowrap text-xs text-slate-600">
                            {formatDateTime(log.createdAt)}
                          </Td>
                          <Td>
                            <Badge tone={actionInfo.tone}>{actionInfo.label}</Badge>
                          </Td>
                          <Td className="text-xs">
                            <span className="font-medium text-slate-900">{log.actor?.name ?? "Sistem"}</span>
                            {log.actor?.email ? (
                              <span className="block text-[11px] text-slate-500">{log.actor.email}</span>
                            ) : null}
                          </Td>
                          <Td className="text-xs text-slate-600">{log.source ?? "—"}</Td>
                          <Td className="text-xs text-slate-700">
                            {changes && typeof changes === "object" && Object.keys(changes).length > 0 ? (
                              <div className="space-y-1">
                                {Object.entries(changes).map(([field, delta]) => (
                                  <div key={field} className="font-mono text-[11px]">
                                    <span className="font-semibold text-slate-800">{field}:</span>{" "}
                                    <span className="text-red-600 line-through">{String(delta.from ?? "—")}</span>{" "}
                                    <span className="text-slate-400">→</span>{" "}
                                    <span className="text-emerald-700 font-semibold">{String(delta.to ?? "—")}</span>
                                  </div>
                                ))}
                              </div>
                            ) : meta.updatedFields && Array.isArray(meta.updatedFields) ? (
                              <span className="text-slate-600">
                                Diperbarui: {meta.updatedFields.join(", ")}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : tab === "inventory" ? (
            <div className="space-y-4">
              {data.item.stockBalances.length === 0 ? (
                <EmptyState
                  title="Belum ada saldo persediaan"
                  description="Barang ini belum memiliki catatan saldo stok di gudang manapun."
                />
              ) : (
                <Table>
                  <TableHead>
                    <Tr>
                      <Th>Gudang</Th>
                      <Th align="right">Fisik (On Hand)</Th>
                      <Th align="right">Dipesan (Reserved)</Th>
                      <Th align="right">Diblokir (Blocked)</Th>
                      <Th align="right">Tersedia (Available)</Th>
                      <Th align="right">Biaya Rata-rata</Th>
                      <Th align="right">Nilai Stok</Th>
                      <Th>Valuasi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {data.item.stockBalances.map((bal) => {
                      const onHand = Number(bal.onHand);
                      const reserved = Number(bal.reserved);
                      const blocked = Number(bal.blocked);
                      const available = Math.max(0, onHand - reserved - blocked);

                      return (
                        <Tr key={bal.id}>
                          <Td>
                            <span className="font-medium text-slate-900">{bal.warehouse.code}</span>
                            <span className="block text-xs text-slate-500">{bal.warehouse.name}</span>
                          </Td>
                          <Td align="right" className="tnum font-medium text-slate-900">
                            {formatQuantity(bal.onHand)} {data.item.baseUom?.code}
                          </Td>
                          <Td align="right" className="tnum text-amber-700">
                            {formatQuantity(bal.reserved)}
                          </Td>
                          <Td align="right" className="tnum text-rose-700">
                            {formatQuantity(bal.blocked)}
                          </Td>
                          <Td align="right" className="tnum font-semibold text-emerald-700">
                            {formatQuantity(available)}
                          </Td>
                          <Td align="right" className="tnum text-slate-700">
                            {formatMoney(bal.averageUnitCost)}
                          </Td>
                          <Td align="right" className="tnum font-semibold text-slate-900">
                            {formatMoney(bal.onHandValue)}
                          </Td>
                          <Td>
                            <Badge tone={bal.valuationComplete ? "success" : "warning"}>
                              {bal.valuationComplete ? "Lengkap" : "Pending"}
                            </Badge>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Sebagai Output (BOM Parent) */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span>Revisi BOM Output (Produksi Sendiri)</span>
                  <Badge tone="neutral">{data.item.bomOutputs.length}</Badge>
                </h3>
                {data.item.bomOutputs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Barang ini tidak memiliki BOM sebagai produk jadi/sub-assembly.</p>
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Nomor BOM</Th>
                        <Th>Revisi</Th>
                        <Th align="right">Qty Output</Th>
                        <Th>Status</Th>
                        <Th>Tanggal Efektif</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {data.item.bomOutputs.map((bom) => (
                        <Tr key={bom.id}>
                          <Td className="font-mono text-xs font-semibold text-brand-600">{bom.number}</Td>
                          <Td className="text-xs font-medium text-slate-800">{bom.revision}</Td>
                          <Td align="right" className="tnum text-xs font-medium text-slate-900">
                            {formatQuantity(bom.outputQty)} {data.item.baseUom?.code}
                          </Td>
                          <Td>
                            <StatusBadge status={bom.status} />
                          </Td>
                          <Td className="text-xs text-slate-600">
                            {bom.effectiveDate ? formatDateTime(bom.effectiveDate) : "—"}
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Sebagai Komponen (BOM Children) */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span>Digunakan Sebagai Komponen Pada BOM Lain</span>
                  <Badge tone="neutral">{data.item.bomComponents.length}</Badge>
                </h3>
                {data.item.bomComponents.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Barang ini tidak digunakan dalam BOM barang lain.</p>
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Nomor BOM</Th>
                        <Th>Produk Induk</Th>
                        <Th>Revisi</Th>
                        <Th>Status BOM</Th>
                        <Th align="right">Satuan</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {data.item.bomComponents.map((line) => (
                        <Tr key={line.id}>
                          <Td className="font-mono text-xs font-semibold text-brand-600">{line.bom.number}</Td>
                          <Td className="text-xs font-medium text-slate-900">
                            {line.bom.outputItem.sku} — {line.bom.outputItem.name}
                          </Td>
                          <Td className="text-xs font-medium text-slate-700">{line.bom.revision}</Td>
                          <Td>
                            <StatusBadge status={line.bom.status} />
                          </Td>
                          <Td align="right" className="text-xs text-slate-600">{line.uom.code}</Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-slate-200 bg-slate-50">
          <Button variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
