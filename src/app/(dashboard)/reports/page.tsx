"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMoney, formatQuantity } from "@/lib/format";

type MoRaw = {
  id: string;
  number: string;
  status: string;
  quantity: string;
  producedQuantity: string;
  item?: { sku: string | null; name: string | null };
};

type CostSnapshot = {
  id: string;
  type: "ESTIMATE" | "ACTUAL";
  materialCost: string;
  laborCost: string;
  overheadCost: string;
  totalCost: string;
  wipCost: string;
  completedCost: string;
  costPerAcceptedUnit: string | null;
  valuationComplete: boolean;
  createdAt: string;
};

type CostRecord = {
  moId: string;
  moNumber: string;
  itemSku: string;
  status: string;
  estimatedCost: number | null;
  actualCost: number | null;
  wipCost: number;
  variance: number | null;
};

type BalanceRow = {
  id: string;
  item: { sku: string; name: string; baseUom: { code: string } | null };
  warehouse: { code: string; name: string };
  onHand: string;
  averageUnitCost: string | null;
};

type ValuationRow = {
  key: string;
  sku: string;
  name: string;
  warehouseCode: string;
  onHand: string;
  unitCost: string | null;
  valued: boolean;
  value: number | null;
};

type Tab = "costs" | "inventory" | "wip";

function toNumber(value: string | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const content = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [tab, setTab] = useState<Tab>("costs");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [moRes, balanceRes] = await Promise.all([
        fetch("/api/v1/manufacturing/orders?limit=100"),
        fetch("/api/v1/inventory/balances"),
      ]);
      if (!moRes.ok || !balanceRes.ok) throw new Error("Gagal memuat data laporan");
      const [moJson, balanceJson] = await Promise.all([moRes.json(), balanceRes.json()]);
      const mos = (moJson.data ?? []) as MoRaw[];
      setBalances(balanceJson.data ?? []);

      const snapshotResults = await Promise.all(
        mos.map(async (mo) => {
          try {
            const res = await fetch(`/api/v1/manufacturing/orders/${mo.id}/costs`);
            if (!res.ok) return { mo, snapshots: [] as CostSnapshot[] };
            const json = await res.json();
            return { mo, snapshots: (json.data ?? []) as CostSnapshot[] };
          } catch {
            return { mo, snapshots: [] as CostSnapshot[] };
          }
        }),
      );

      const records: CostRecord[] = snapshotResults.map(({ mo, snapshots }) => {
        const estimate = snapshots.find((snapshot) => snapshot.type === "ESTIMATE");
        const actual = snapshots.find((snapshot) => snapshot.type === "ACTUAL");
        const estimatedCost = estimate ? toNumber(estimate.totalCost) : null;
        const actualCost = actual ? toNumber(actual.totalCost) : null;
        return {
          moId: mo.id,
          moNumber: mo.number,
          itemSku: mo.item?.sku ?? "—",
          status: mo.status,
          estimatedCost,
          actualCost,
          wipCost: actual ? toNumber(actual.wipCost) : 0,
          variance: estimatedCost !== null && actualCost !== null ? actualCost - estimatedCost : null,
        };
      });

      setCosts(records);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data laporan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const costTotals = useMemo(() => {
    return costs.reduce(
      (acc, row) => {
        acc.estimated += row.estimatedCost ?? 0;
        acc.actual += row.actualCost ?? 0;
        acc.variance += row.variance ?? 0;
        acc.wip += row.wipCost;
        return acc;
      },
      { estimated: 0, actual: 0, variance: 0, wip: 0 },
    );
  }, [costs]);

  const valuationRows = useMemo<ValuationRow[]>(
    () =>
      balances
        .map((row) => ({
          key: row.id,
          sku: row.item.sku,
          name: row.item.name,
          warehouseCode: row.warehouse.code,
          onHand: row.onHand,
          unitCost: row.averageUnitCost,
          valued: row.averageUnitCost !== null,
          value: row.averageUnitCost === null ? null : toNumber(row.onHand) * toNumber(row.averageUnitCost),
        }))
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1)),
    [balances],
  );

  const inventoryTotal = useMemo(
    () => valuationRows.reduce((sum, row) => sum + (row.value ?? 0), 0),
    [valuationRows],
  );

  const unvaluedCount = useMemo(
    () => valuationRows.filter((row) => !row.valued).length,
    [valuationRows],
  );

  const costsWithVariance = costs.filter((row) => row.variance !== null);
  const overBudget = costsWithVariance.filter((row) => (row.variance ?? 0) > 0).length;

  function exportVariance() {
    downloadCsv(
      `variansi-produksi-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Nomor MO", "SKU", "Status", "Estimasi", "Aktual", "Variansi"],
      costs.map((row) => [
        row.moNumber,
        row.itemSku,
        row.status,
        row.estimatedCost ?? "",
        row.actualCost ?? "",
        row.variance ?? "",
      ]),
    );
  }

  function exportInventory() {
    downloadCsv(
      `valuasi-inventori-${new Date().toISOString().slice(0, 10)}.csv`,
      ["SKU", "Barang", "Gudang", "On hand", "Biaya rata-rata", "Nilai"],
      valuationRows.map((row) => [
        row.sku,
        row.name,
        row.warehouseCode,
        row.onHand,
        row.unitCost ?? "",
        row.value === null ? "" : row.value.toFixed(2),
      ]),
    );
  }

  async function calculateCost(moId: string, type: "ESTIMATE" | "ACTUAL") {
    setActingId(moId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manufacturing/orders/${moId}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menghitung biaya");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghitung biaya");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Biaya & laporan"
        title="Biaya & laporan"
        description="Estimasi dan aktual biaya produksi, variansi, valuasi inventori, serta nilai WIP."
        actions={
          <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}

      <StatGrid>
        <Stat label="Estimasi biaya" hint="Total MO" value={formatMoney(costTotals.estimated.toFixed(2))} />
        <Stat label="Biaya aktual" hint="Total MO" value={formatMoney(costTotals.actual.toFixed(2))} />
        <Stat
          label="Variansi"
          hint={`${overBudget} MO melebihi estimasi`}
          tone={costTotals.variance > 0 ? "danger" : costTotals.variance < 0 ? "success" : "neutral"}
          value={formatMoney(costTotals.variance.toFixed(2))}
        />
        <Stat label="Nilai inventori" hint={unvaluedCount > 0 ? `${unvaluedCount} saldo belum dinilai` : "On hand × biaya rata-rata"} value={formatMoney(inventoryTotal.toFixed(2))} />
      </StatGrid>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {([
          { id: "costs", label: "Biaya produksi" },
          { id: "inventory", label: "Valuasi inventori" },
          { id: "wip", label: "Nilai WIP" },
        ] as Array<{ id: Tab; label: string }>).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              tab === entry.id
                ? "bg-brand-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "costs" ? (
        <Card>
          <CardHeader
            title="Biaya produksi per pesanan"
            description={`${costsWithVariance.length} pesanan memiliki pembanding estimasi dan aktual.`}
            actions={
              <Button variant="secondary" size="sm" onClick={exportVariance} disabled={costs.length === 0}>
                Ekspor CSV
              </Button>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat data biaya…</div>
            ) : costs.length === 0 ? (
              <EmptyState title="Belum ada pesanan produksi" description="Biaya muncul setelah MO dibuat dan snapshot biaya dihitung." />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor MO</Th>
                    <Th>SKU</Th>
                    <Th>Status</Th>
                    <Th align="right">Estimasi</Th>
                    <Th align="right">Aktual</Th>
                    <Th align="right">Variansi</Th>
                    <Th align="right">Variansi %</Th>
                    <Th align="right">Aksi</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {costs.map((row) => {
                    const variancePercent =
                      row.variance !== null && row.estimatedCost
                        ? (row.variance / row.estimatedCost) * 100
                        : null;
                    return (
                      <Tr key={row.moId}>
                        <Td className="tnum font-medium">{row.moNumber}</Td>
                        <Td className="tnum text-slate-600">{row.itemSku}</Td>
                        <Td>{<StatusBadge status={row.status} />}</Td>
                        <Td align="right" className="tnum text-slate-600">
                          {row.estimatedCost === null ? "—" : formatMoney(row.estimatedCost.toFixed(2))}
                        </Td>
                        <Td align="right" className="tnum text-slate-600">
                          {row.actualCost === null ? "—" : formatMoney(row.actualCost.toFixed(2))}
                        </Td>
                        <Td
                          align="right"
                          className={`tnum font-medium ${
                            row.variance === null ? "text-slate-400" : row.variance > 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {row.variance === null ? "—" : formatMoney(row.variance.toFixed(2))}
                        </Td>
                        <Td
                          align="right"
                          className={`tnum ${
                            variancePercent === null ? "text-slate-400" : variancePercent > 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {variancePercent === null ? "—" : `${variancePercent.toFixed(1)}%`}
                        </Td>
                        <Td align="right">
                          <div className="flex items-center justify-end gap-1.5">
                            {row.estimatedCost === null ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={actingId === row.moId}
                                onClick={() => { void calculateCost(row.moId, "ESTIMATE"); }}
                              >
                                Estimasi
                              </Button>
                            ) : null}
                            <Button
                              variant={row.actualCost === null ? "primary" : "secondary"}
                              size="sm"
                              loading={actingId === row.moId}
                              onClick={() => { void calculateCost(row.moId, "ACTUAL"); }}
                            >
                              {row.actualCost === null ? "Hitung aktual" : "Perbarui aktual"}
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "inventory" ? (
        <Card>
          <CardHeader
            title="Valuasi inventori"
            description="Nilai persediaan berdasarkan on hand dan biaya rata-rata bergerak."
            actions={
              <Button variant="secondary" size="sm" onClick={exportInventory} disabled={valuationRows.length === 0}>
                Ekspor CSV
              </Button>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat valuasi…</div>
            ) : valuationRows.length === 0 ? (
              <EmptyState title="Belum ada saldo stok bernilai" />
            ) : (
              <>
                {unvaluedCount > 0 ? (
                  <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-[13px] text-amber-800">
                    {unvaluedCount} saldo belum memiliki biaya rata-rata, biasanya karena penerimaan produksi belum dinilai. Nilainya tidak dihitung dalam total.
                  </div>
                ) : null}
                <Table>
                  <TableHead>
                    <Tr>
                      <Th>SKU</Th>
                      <Th>Barang</Th>
                      <Th>Gudang</Th>
                      <Th align="right">On hand</Th>
                      <Th align="right">Biaya rata-rata</Th>
                      <Th align="right">Nilai</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {valuationRows.map((row) => (
                      <Tr key={row.key}>
                        <Td className="tnum font-medium">{row.sku}</Td>
                        <Td className="text-slate-600">{row.name}</Td>
                        <Td className="tnum text-slate-600">{row.warehouseCode}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(row.onHand)}</Td>
                        <Td align="right" className="tnum text-slate-600">
                          {row.unitCost ? formatMoney(row.unitCost) : <span className="text-amber-700">Belum dinilai</span>}
                        </Td>
                        <Td align="right" className="tnum font-medium text-slate-700">{row.value === null ? "—" : formatMoney(row.value.toFixed(2))}</Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "wip" ? (
        <Card>
          <CardHeader
            title="Nilai barang dalam proses"
            description="WIP diambil dari snapshot biaya aktual terakhir pada pesanan yang masih berjalan."
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat nilai WIP…</div>
            ) : costs.filter((row) => row.wipCost > 0).length === 0 ? (
              <EmptyState
                title="Belum ada nilai WIP"
                description="Hitung biaya aktual pada pesanan produksi yang sudah mengonsumsi bahan."
              />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor MO</Th>
                    <Th>SKU</Th>
                    <Th>Status</Th>
                    <Th align="right">Nilai WIP</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {costs
                    .filter((row) => row.wipCost > 0)
                    .map((row) => (
                      <Tr key={row.moId}>
                        <Td className="tnum font-medium">{row.moNumber}</Td>
                        <Td className="tnum text-slate-600">{row.itemSku}</Td>
                        <Td>{<StatusBadge status={row.status} />}</Td>
                        <Td align="right" className="tnum text-slate-700">{formatMoney(row.wipCost.toFixed(2))}</Td>
                      </Tr>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
