"use client";

import Link from "next/link";
import Decimal from "decimal.js";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, SearchInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { formatMoney, formatQuantity, todayJakarta } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

type CostRecord = {
  moId: string;
  moNumber: string;
  itemSku: string;
  status: string;
  estimatedCost: number | null;
  actualCost: number | null;
  estimatedMaterialCost: number | null;
  actualMaterialCost: number | null;
  estimatedLaborCost: number | null;
  actualLaborCost: number | null;
  estimatedOverheadCost: number | null;
  actualOverheadCost: number | null;
  costPerAcceptedUnit: string | null;
  actualValuationComplete: boolean;
  wipCost: number;
  variance: number | null;
  materialVariance: number | null;
  laborVariance: number | null;
  overheadVariance: number | null;
};

type BalanceRow = {
  id: string;
  item: { sku: string; name: string; baseUom: { code: string } | null };
  warehouse: { code: string; name: string };
  onHand: string;
  onHandValue: string;
  averageUnitCost: string | null;
  valuationComplete: boolean;
};

type ValuationRow = {
  key: string;
  sku: string;
  name: string;
  warehouseCode: string;
  onHand: string;
  unitCost: string | null;
  valued: boolean;
  value: number;
};

type Tab = "costs" | "inventory" | "wip";

function toNumber(value: string | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}


export default function ReportsPage() {
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [tab, setTab] = useState<Tab>("costs");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [expandedMoId, setExpandedMoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Costs tab: search + pagination
  const [costsSearch, setCostsSearch] = useState("");
  const [costsPage, setCostsPage] = useState(1);
  const costsPageSize = 15;

  // Inventory tab: search + pagination
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryPage, setInventoryPage] = useState(1);
  const inventoryPageSize = 20;

  // WIP tab: search + pagination
  const [wipSearch, setWipSearch] = useState("");
  const [wipPage, setWipPage] = useState(1);
  const wipPageSize = 15;

  // Period filter
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = useCallback(async (start?: string, end?: string) => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      const s = start !== undefined ? start : startDate;
      const e = end !== undefined ? end : endDate;
      if (s) queryParams.set("startDate", s);
      if (e) queryParams.set("endDate", e);
      const url = `/api/v1/reports/costs${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

      const [costRes, balanceRes] = await Promise.all([
        fetch(url),
        fetch("/api/v1/inventory/balances"),
      ]);
      if (!costRes.ok || !balanceRes.ok) throw new Error("Gagal memuat data laporan");
      const [costJson, balanceJson] = await Promise.all([costRes.json(), balanceRes.json()]);
      setCosts(costJson.data ?? []);
      setBalances(balanceJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data laporan");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined" && costs.length > 0 && !expandedMoId) {
      const params = new URLSearchParams(window.location.search);
      const moParam = params.get("mo");
      if (moParam) {
        const found = costs.find((c) => c.moNumber.toLowerCase() === moParam.toLowerCase());
        if (found) {
          setExpandedMoId(found.moId);
        }
      }
    }
  }, [costs, expandedMoId]);

  const costTotals = useMemo(() => {
    let estimated = new Decimal(0);
    let actual = new Decimal(0);
    let variance = new Decimal(0);
    let wip = new Decimal(0);
    for (const row of costs) {
      if (row.estimatedCost !== null) estimated = estimated.plus(row.estimatedCost);
      if (row.actualCost !== null) actual = actual.plus(row.actualCost);
      if (row.variance !== null) variance = variance.plus(row.variance);
      wip = wip.plus(row.wipCost);
    }
    return {
      estimated: estimated.toString(),
      actual: actual.toString(),
      variance: variance.toString(),
      wip: wip.toString(),
      varianceIsPositive: variance.isPositive() && !variance.isZero(),
      varianceIsNegative: variance.isNegative(),
    };
  }, [costs]);

  const valuationRows = useMemo<ValuationRow[]>(
    () =>
      balances
        .filter((row) => toNumber(row.onHand) > 0)
        .map((row) => ({
          key: row.id,
          sku: row.item.sku,
          name: row.item.name,
          warehouseCode: row.warehouse.code,
          onHand: row.onHand,
          onHandValue: row.onHandValue,
          unitCost: row.averageUnitCost,
          valued: row.valuationComplete,
          // Incomplete balances may contain a carried book value for only part of the quantity.
          // Do not present that partial amount as the total inventory valuation.
          value: row.valuationComplete && row.onHandValue ? new Decimal(row.onHandValue).toNumber() : 0,
        }))
        .sort((a, b) => b.value - a.value),
    [balances],
  );

  const inventoryTotal = useMemo(() => {
    let total = new Decimal(0);
    for (const row of valuationRows) {
      total = total.plus(row.value);
    }
    return total.toString();
  }, [valuationRows]);

  const unvaluedCount = useMemo(
    () => valuationRows.filter((row) => !row.valued).length,
    [valuationRows],
  );

  // Costs tab filtered + paginated
  const filteredCosts = useMemo(() => {
    const needle = costsSearch.trim().toLowerCase();
    if (!needle) return costs;
    return costs.filter(
      (row) =>
        row.moNumber.toLowerCase().includes(needle) ||
        row.itemSku.toLowerCase().includes(needle),
    );
  }, [costs, costsSearch]);

  const paginatedCosts = useMemo(() => {
    const start = (costsPage - 1) * costsPageSize;
    return filteredCosts.slice(start, start + costsPageSize);
  }, [filteredCosts, costsPage, costsPageSize]);

  // Inventory tab filtered + paginated
  const filteredValuation = useMemo(() => {
    const needle = inventorySearch.trim().toLowerCase();
    if (!needle) return valuationRows;
    return valuationRows.filter(
      (row) =>
        row.sku.toLowerCase().includes(needle) ||
        (row.name ?? "").toLowerCase().includes(needle) ||
        row.warehouseCode.toLowerCase().includes(needle),
    );
  }, [valuationRows, inventorySearch]);

  const paginatedValuation = useMemo(() => {
    const start = (inventoryPage - 1) * inventoryPageSize;
    return filteredValuation.slice(start, start + inventoryPageSize);
  }, [filteredValuation, inventoryPage, inventoryPageSize]);

  // WIP tab filtered + paginated
  const wipRows = useMemo(() => costs.filter((row) => row.wipCost > 0), [costs]);

  const filteredWip = useMemo(() => {
    const needle = wipSearch.trim().toLowerCase();
    if (!needle) return wipRows;
    return wipRows.filter(
      (row) =>
        row.moNumber.toLowerCase().includes(needle) ||
        row.itemSku.toLowerCase().includes(needle),
    );
  }, [wipRows, wipSearch]);

  const paginatedWip = useMemo(() => {
    const start = (wipPage - 1) * wipPageSize;
    return filteredWip.slice(start, start + wipPageSize);
  }, [filteredWip, wipPage, wipPageSize]);

  const costsWithVariance = filteredCosts.filter((row) => row.variance !== null);
  const overBudget = costs.filter((row) => (row.variance ?? 0) > 0).length;

  function exportVariance() {
    downloadCsv(
      `variansi-produksi-${todayJakarta()}.csv`,
      [
        "Nomor MO",
        "SKU",
        "Status",
        "Estimasi Total",
        "Aktual Total",
        "Variansi Total",
        "Estimasi Material",
        "Aktual Material",
        "Variansi Material",
        "Estimasi Tenaga Kerja",
        "Aktual Tenaga Kerja",
        "Variansi Tenaga Kerja",
        "Estimasi Overhead",
        "Aktual Overhead",
        "Variansi Overhead",
        "WIP",
        "Biaya Per Unit Diterima",
        "Status Valuasi",
      ],
      costs.map((row) => [
        row.moNumber,
        row.itemSku,
        row.status,
        row.estimatedCost ?? "",
        row.actualCost ?? "",
        row.variance ?? "",
        row.estimatedMaterialCost ?? "",
        row.actualMaterialCost ?? "",
        row.materialVariance ?? "",
        row.estimatedLaborCost ?? "",
        row.actualLaborCost ?? "",
        row.laborVariance ?? "",
        row.estimatedOverheadCost ?? "",
        row.actualOverheadCost ?? "",
        row.overheadVariance ?? "",
        row.wipCost ?? "",
        row.costPerAcceptedUnit ?? "",
        row.actualValuationComplete ? "Lengkap" : "Parsial",
      ]),
    );
  }

  function exportInventory() {
    downloadCsv(
      `valuasi-inventori-${todayJakarta()}.csv`,
      ["SKU", "Barang", "Gudang", "On hand", "Biaya rata-rata", "Nilai"],
      valuationRows.map((row) => [
        row.sku,
        row.name,
        row.warehouseCode,
        row.onHand,
        row.unitCost ?? "",
        row.value.toFixed(2),
      ]),
    );
  }

  function exportWip() {
    const wipRows = costs.filter((row) => row.wipCost > 0);
    downloadCsv(
      `nilai-wip-${todayJakarta()}.csv`,
      ["Nomor MO", "SKU", "Status", "Nilai WIP"],
      wipRows.map((row) => [
        row.moNumber,
        row.itemSku,
        row.status,
        row.wipCost.toFixed(2),
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
        eyebrow="Finance & Cost Accounting"
        title="Costing & Analisis Variansi"
        description="Estimasi vs aktual biaya produksi, variansi material/labor/overhead, valuasi inventory bergerak, serta nilai WIP."
        actions={
          <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}

      <StatGrid>
        <Stat label="Estimasi biaya" hint="Total MO" value={formatMoney(costTotals.estimated)} />
        <Stat label="Biaya aktual" hint={costs.filter((row) => row.actualCost !== null && !row.actualValuationComplete).length > 0 ? `${costs.filter((row) => row.actualCost !== null && !row.actualValuationComplete).length} MO biaya belum lengkap` : "Total MO terbiaya"} value={formatMoney(costTotals.actual)} />
        <Stat
          label="Variansi"
          hint={`${overBudget} MO melebihi estimasi`}
          tone={costTotals.varianceIsPositive ? "danger" : costTotals.varianceIsNegative ? "success" : "neutral"}
          value={formatMoney(costTotals.variance)}
        />
        <Stat label="Nilai inventori" hint={unvaluedCount > 0 ? `${unvaluedCount} saldo belum dinilai` : "Jumlah nilai buku persediaan"} value={formatMoney(inventoryTotal)} />
      </StatGrid>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {([
          { id: "costs", label: "Biaya Produksi (MO)" },
          { id: "inventory", label: "Valuasi Inventory" },
          { id: "wip", label: "Work In Progress (WIP)" },
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">Filter Periode:</span>
          <div className="flex items-center gap-1.5">
            <label htmlFor="report-start-date" className="text-xs text-slate-500">Dari:</label>
            <Input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-xs py-0 px-2 w-36"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="report-end-date" className="text-xs text-slate-500">Sampai:</label>
            <Input
              id="report-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 text-xs py-0 px-2 w-36"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { void load(startDate, endDate); }}
            loading={loading}
          >
            Terapkan
          </Button>
          {startDate || endDate ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                void load("", "");
              }}
            >
              Reset
            </Button>
          ) : null}
        </div>
        <div className="text-xs text-slate-500">
          {startDate || endDate ? (
            <span>
              Periode: <strong className="text-slate-800">{startDate || "Awal"}</strong> s/d <strong className="text-slate-800">{endDate || "Sekarang"}</strong>
            </span>
          ) : (
            <span>Menampilkan seluruh periode</span>
          )}
        </div>
      </div>

      {tab === "costs" ? (
        <Card>
          <CardHeader
            title="Biaya Produksi & Variansi per Manufacturing Order (MO)"
            description={`${filteredCosts.length} dari ${costs.length} pesanan · ${costsWithVariance.length} memiliki pembanding estimasi dan aktual.`}
            actions={
              <div className="flex items-center gap-2">
                <SearchInput
                  value={costsSearch}
                  onChange={(v) => { setCostsSearch(v); setCostsPage(1); }}
                  placeholder="Cari nomor MO atau SKU…"
                />
                <Button variant="secondary" size="sm" onClick={exportVariance} disabled={costs.length === 0}>
                  Ekspor CSV
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat data biaya…</div>
            ) : costs.length === 0 ? (
              <EmptyState title="Belum ada pesanan produksi" description="Biaya muncul setelah MO dibuat dan snapshot biaya dihitung." />
            ) : filteredCosts.length === 0 ? (
              <EmptyState title="Tidak ada hasil" description="Tidak ada pesanan yang cocok dengan pencarian." />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th className="w-8"></Th>
                      <Th className="w-[140px]">Nomor MO</Th>
                      <Th className="w-[140px]">SKU</Th>
                      <Th className="w-[110px]">Status</Th>
                      <Th align="right" className="w-[120px]">Estimasi</Th>
                      <Th align="right" className="w-[120px]">Aktual</Th>
                      <Th align="right" className="w-[120px]">Variansi</Th>
                      <Th align="right" className="w-[90px]">Variansi %</Th>
                      <Th align="right" className="w-[120px]">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedCosts.map((row) => {
                    const variancePercent =
                      row.variance !== null && row.estimatedCost !== null && row.estimatedCost !== 0
                        ? (row.variance / row.estimatedCost) * 100
                        : null;
                    return (
                      <Fragment key={row.moId}>
                        <Tr>
                          <Td className="w-8 pr-0">
                            <button
                              type="button"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              onClick={() => setExpandedMoId(expandedMoId === row.moId ? null : row.moId)}
                              aria-label={`Rincian variansi ${row.moNumber}`}
                            >
                              {expandedMoId === row.moId ? (
                                <ChevronUp aria-hidden className="size-4" />
                              ) : (
                                <ChevronDown aria-hidden className="size-4" />
                              )}
                            </button>
                          </Td>
                          <Td className="tnum font-medium">
                            <Link
                              href={`/manufacturing?mo=${row.moId}`}
                              className="font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                            >
                              {row.moNumber}
                            </Link>
                          </Td>
                          <Td className="tnum text-slate-600">{row.itemSku}</Td>
                          <Td>{<StatusBadge status={row.status} />}</Td>
                          <Td align="right" className="tnum text-slate-600">
                            {row.estimatedCost === null ? "—" : formatMoney(row.estimatedCost.toFixed(2))}
                          </Td>
                          <Td align="right" className="tnum text-slate-600">
                            {row.actualCost === null ? "—" : <span>{formatMoney(row.actualCost.toFixed(2))}{!row.actualValuationComplete ? <span className="ml-1 text-amber-700" title="Sebagian material atau tenaga kerja belum dinilai">†</span> : null}</span>}
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
                              {row.status === "COMPLETED" ? (
                                row.actualCost === null ? (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    loading={actingId === row.moId}
                                    onClick={() => { void calculateCost(row.moId, "ACTUAL"); }}
                                  >
                                    Hitung aktual
                                  </Button>
                                ) : (
                                  <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                                    Aktual final
                                  </span>
                                )
                              ) : (
                                <span className="text-[12px] text-slate-400" title="Biaya aktual hanya dapat dihitung setelah pesanan selesai">
                                  Menunggu selesai
                                </span>
                              )}
                            </div>
                          </Td>
                        </Tr>
                        {expandedMoId === row.moId ? (
                          <Tr className="bg-slate-50/60">
                            <Td colSpan={9} className="px-6 py-4">
                              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                                    Rincian Variansi Biaya — {row.moNumber} ({row.itemSku})
                                  </h4>
                                  <span className="text-xs text-slate-500">
                                    Biaya per unit diterima: <strong className="text-slate-900">{row.costPerAcceptedUnit ? formatMoney(row.costPerAcceptedUnit) : "—"}</strong>
                                  </span>
                                </div>
                                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                  <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3">
                                    <p className="text-xs font-medium text-slate-500">Bahan Baku (Material)</p>
                                    <div className="mt-1.5 space-y-0.5 text-xs">
                                      <div className="flex justify-between text-slate-600">
                                        <span>Estimasi:</span>
                                        <span className="tnum font-medium">{row.estimatedMaterialCost !== null ? formatMoney(row.estimatedMaterialCost.toFixed(2)) : "—"}</span>
                                      </div>
                                      <div className="flex justify-between text-slate-600">
                                        <span>Aktual:</span>
                                        <span className="tnum font-medium">{row.actualMaterialCost !== null ? formatMoney(row.actualMaterialCost.toFixed(2)) : "—"}</span>
                                      </div>
                                      <div className="flex justify-between border-t border-slate-200/60 pt-1 font-semibold">
                                        <span>Selisih:</span>
                                        <span className={`tnum ${row.materialVariance === null ? "text-slate-400" : row.materialVariance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                          {row.materialVariance !== null ? formatMoney(row.materialVariance.toFixed(2)) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3">
                                    <p className="text-xs font-medium text-slate-500">Tenaga Kerja (Labor)</p>
                                    <div className="mt-1.5 space-y-0.5 text-xs">
                                      <div className="flex justify-between text-slate-600">
                                        <span>Estimasi:</span>
                                        <span className="tnum font-medium">{row.estimatedLaborCost !== null ? formatMoney(row.estimatedLaborCost.toFixed(2)) : "—"}</span>
                                      </div>
                                      <div className="flex justify-between text-slate-600">
                                        <span>Aktual:</span>
                                        <span className="tnum font-medium">{row.actualLaborCost !== null ? formatMoney(row.actualLaborCost.toFixed(2)) : "—"}</span>
                                      </div>
                                      <div className="flex justify-between border-t border-slate-200/60 pt-1 font-semibold">
                                        <span>Selisih:</span>
                                        <span className={`tnum ${row.laborVariance === null ? "text-slate-400" : row.laborVariance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                          {row.laborVariance !== null ? formatMoney(row.laborVariance.toFixed(2)) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3">
                                    <p className="text-xs font-medium text-slate-500">Overhead Pabrik & Valuasi</p>
                                    <div className="mt-1.5 space-y-0.5 text-xs">
                                      <div className="flex justify-between text-slate-600">
                                        <span>Estimasi OH:</span>
                                        <span className="tnum font-medium">{row.estimatedOverheadCost !== null ? formatMoney(row.estimatedOverheadCost.toFixed(2)) : "—"}</span>
                                      </div>
                                      <div className="flex justify-between text-slate-600">
                                        <span>Aktual OH:</span>
                                        <span className="tnum font-medium">{row.actualOverheadCost !== null ? formatMoney(row.actualOverheadCost.toFixed(2)) : "—"}</span>
                                      </div>
                                      <div className="flex justify-between border-t border-slate-200/60 pt-1 font-semibold">
                                        <span>Selisih OH:</span>
                                        <span className={`tnum ${row.overheadVariance === null ? "text-slate-400" : row.overheadVariance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                          {row.overheadVariance !== null ? formatMoney(row.overheadVariance.toFixed(2)) : "—"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between pt-0.5">
                                        <span className="text-slate-500">Valuasi:</span>
                                        <span className={`font-medium ${row.actualValuationComplete ? "text-emerald-700" : "text-amber-700"}`}>
                                          {row.actualValuationComplete ? "Lengkap" : "Sebagian unpriced"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2.5 text-xs">
                                  <span className="text-slate-500">
                                    Tindak lanjut operasional pesanan manufaktur:
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <Link
                                      href={`/manufacturing/materials?mo=${row.moId}`}
                                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800 hover:underline"
                                    >
                                      Periksa Bahan & Konsumsi
                                      <ExternalLink aria-hidden className="size-3" />
                                    </Link>
                                    <span className="text-slate-300">&middot;</span>
                                    <Link
                                      href={`/manufacturing/work-orders?mo=${row.moId}`}
                                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800 hover:underline"
                                    >
                                      Periksa Work Orders (WO)
                                      <ExternalLink aria-hidden className="size-3" />
                                    </Link>
                                    <span className="text-slate-300">&middot;</span>
                                    <Link
                                      href={`/manufacturing?mo=${row.moId}`}
                                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800 hover:underline"
                                    >
                                      Detail MO
                                      <ExternalLink aria-hidden className="size-3" />
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </Td>
                          </Tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                currentPage={costsPage}
                pageSize={costsPageSize}
                totalItems={filteredCosts.length}
                onPageChange={setCostsPage}
              />
            </>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "inventory" ? (
        <Card>
          <CardHeader
            title="Valuasi Stok Persediaan (Inventory Valuation)"
            description={`${filteredValuation.length} dari ${valuationRows.length} saldo · nilai persediaan berdasarkan on hand dan biaya rata-rata bergerak.`}
            actions={
              <div className="flex items-center gap-2">
                <SearchInput
                  value={inventorySearch}
                  onChange={(v) => { setInventorySearch(v); setInventoryPage(1); }}
                  placeholder="Cari SKU, nama, atau gudang…"
                />
                <Button variant="secondary" size="sm" onClick={exportInventory} disabled={valuationRows.length === 0}>
                  Ekspor CSV
                </Button>
              </div>
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
                    {unvaluedCount} saldo belum memiliki valuasi lengkap, biasanya karena penerimaan produksi belum dinilai. Saldo tersebut tidak dihitung dalam total nilai saldo tervaluasi.
                  </div>
                ) : null}
                {filteredValuation.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">Tidak ada hasil yang cocok dengan pencarian.</div>
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th className="w-[140px]">SKU</Th>
                        <Th>Nama Barang</Th>
                        <Th className="w-[110px]">Gudang</Th>
                        <Th align="right" className="w-[110px]">On Hand</Th>
                        <Th align="right" className="w-[130px]">Biaya Rata-rata</Th>
                        <Th align="right" className="w-[140px]">Nilai Buku</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {paginatedValuation.map((row) => (
                        <Tr key={row.key}>
                          <Td className="tnum font-medium">
                            <Link href="/inventory" className="font-semibold text-brand-600 hover:text-brand-800 hover:underline">
                              {row.sku}
                            </Link>
                          </Td>
                          <Td className="text-slate-600">{row.name}</Td>
                          <Td className="tnum text-slate-600">{row.warehouseCode}</Td>
                          <Td align="right" className="tnum text-slate-600">{formatQuantity(row.onHand)}</Td>
                          <Td align="right" className="tnum text-slate-600">
                            {row.valued ? (row.unitCost ? formatMoney(row.unitCost) : "—") : <span className="text-amber-700">Belum dinilai</span>}
                          </Td>
                          <Td align="right" className="tnum font-medium text-slate-700">{formatMoney(row.value.toFixed(2))}</Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Pagination
                  currentPage={inventoryPage}
                  pageSize={inventoryPageSize}
                  totalItems={filteredValuation.length}
                  onPageChange={setInventoryPage}
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "wip" ? (
        <Card>
          <CardHeader
            title="Valuasi Work In Progress (WIP)"
            description={`${filteredWip.length} dari ${wipRows.length} pesanan · nilai WIP dari pesanan yang selesai dengan output parsial.`}
            actions={
              <div className="flex items-center gap-2">
                <SearchInput
                  value={wipSearch}
                  onChange={(v) => { setWipSearch(v); setWipPage(1); }}
                  placeholder="Cari nomor MO atau SKU…"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportWip}
                  disabled={wipRows.length === 0}
                >
                  Ekspor CSV
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat nilai WIP…</div>
            ) : wipRows.length === 0 ? (
              <EmptyState
                title="Belum ada nilai WIP"
                description="Nilai WIP dihitung saat pesanan selesai dengan output di bawah target kuantitas."
              />
            ) : filteredWip.length === 0 ? (
              <EmptyState title="Tidak ada hasil" description="Tidak ada pesanan WIP yang cocok dengan pencarian." />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th className="w-[160px]">Nomor MO</Th>
                      <Th>SKU Barang</Th>
                      <Th className="w-[120px]">Status</Th>
                      <Th align="right" className="w-[150px]">Nilai Saldo WIP</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedWip.map((row) => (
                      <Tr key={row.moId}>
                        <Td className="tnum font-medium">
                          <Link href={`/manufacturing?mo=${row.moId}`} className="font-semibold text-brand-600 hover:text-brand-800 hover:underline">
                            {row.moNumber}
                          </Link>
                        </Td>
                        <Td className="tnum text-slate-600">{row.itemSku}</Td>
                        <Td>{<StatusBadge status={row.status} />}</Td>
                        <Td align="right" className="tnum text-slate-700">{formatMoney(row.wipCost.toFixed(2))}</Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={wipPage}
                  pageSize={wipPageSize}
                  totalItems={filteredWip.length}
                  onPageChange={setWipPage}
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
