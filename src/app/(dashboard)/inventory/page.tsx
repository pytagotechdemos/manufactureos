"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { formatDateTime, formatMoney, formatQuantity, todayJakarta } from "@/lib/format";
import { Pagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { downloadCsv } from "@/lib/csv";
import { Download } from "lucide-react";

type BalanceRow = {
  id: string;
  item: { id: string; sku: string; name: string; baseUom: { code: string } | null };
  warehouse: { id: string; code: string; name: string };
  onHand: string;
  reserved: string;
  blocked: string;
  averageUnitCost: string | null;
};

type MovementRow = {
  id: string;
  movementType: string;
  quantity: string;
  unitCost: string | null;
  sourceType: string;
  sourceId: string;
  postedAt: string;
  item: { sku: string; name: string };
  warehouse: { code: string; name: string };
};

type ReservationRow = {
  id: string;
  quantity: string;
  consumedQty: string;
  status: "ACTIVE" | "RELEASED" | "CONSUMED";
  sourceType: string;
  sourceId: string;
  createdAt: string;
  item: { sku: string; name: string };
  warehouse: { code: string; name: string };
};

type Warehouse = { id: string; code: string; name: string };
type Item = { id: string; sku: string; name: string; baseUom: { code: string } | null };

type Tab = "balances" | "receipt" | "issue" | "transfer" | "adjust" | "block" | "reservations" | "movements";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "balances", label: "Saldo Stok" },
  { id: "receipt", label: "Penerimaan" },
  { id: "issue", label: "Pengeluaran" },
  { id: "transfer", label: "Transfer Gudang" },
  { id: "adjust", label: "Penyesuaian" },
  { id: "block", label: "Blokir / Karantina" },
  { id: "reservations", label: "Reservasi Material" },
  { id: "movements", label: "Ledger Mutasi" },
];

export default function InventoryPage() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("balances");
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [reservationStatusFilter, setReservationStatusFilter] = useState<"ACTIVE" | "ALL">("ACTIVE");
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<React.ReactNode | null>(null);
  const [search, setSearch] = useState("");

  const [balancePage, setBalancePage] = useState(1);
  const [balancePageSize, setBalancePageSize] = useState(25);
  const [reservationPage, setReservationPage] = useState(1);
  const [reservationPageSize, setReservationPageSize] = useState(25);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize, setMovementPageSize] = useState(25);

  useEffect(() => {
    setBalancePage(1);
    setReservationPage(1);
    setMovementPage(1);
  }, [search]);

  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">("INCREASE");
  const [blockAction, setBlockAction] = useState<"BLOCK" | "UNBLOCK">("BLOCK");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balanceRes, masterRes, movementRes, reservationRes] = await Promise.all([
        fetch("/api/v1/inventory/balances"),
        fetch("/api/v1/inventory/master-data"),
        fetch("/api/v1/inventory/movements?limit=100"),
        fetch("/api/v1/inventory/reservations"),
      ]);
      if (!balanceRes.ok || !masterRes.ok || !movementRes.ok || !reservationRes.ok) throw new Error("Gagal memuat data inventory");
      const [balanceJson, masterJson, movementJson, reservationJson] = await Promise.all([
        balanceRes.json(),
        masterRes.json(),
        movementRes.json(),
        reservationRes.json(),
      ]);
      setBalances(balanceJson.data ?? []);
      setMovements(movementJson.data ?? []);
      setReservations(reservationJson.data ?? []);
      const master = masterJson.data ?? {};
      setItems(master.items ?? []);
      setWarehouses(master.warehouses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data inventory");
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
      const tabParam = params.get("tab") as Tab | null;
      const skuParam = params.get("sku") || params.get("q");
      if (tabParam && tabs.some((t) => t.id === tabParam)) {
        setTab(tabParam);
      }
      if (skuParam) {
        setSearch(skuParam);
      }
    }
  }, []);

  async function handleReleaseReservation(id: string) {
    const confirmed = await confirm({
      title: "Lepaskan reservasi stok?",
      description: "Stok yang dicadangkan akan dikembalikan ke saldo tersedia dan dapat dialokasikan ke kebutuhan lain.",
      confirmLabel: "Lepaskan reservasi",
      tone: "primary",
    });
    if (!confirmed) return;
    setReleasingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/inventory/reservations/${id}/release`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal melepaskan reservasi");
      setNotice("Reservasi berhasil dilepaskan. Saldo stok telah diperbarui.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal melepaskan reservasi");
    } finally {
      setReleasingId(null);
    }
  }

  const filteredBalances = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return balances;
    return balances.filter(
      (row) =>
        row.item.sku.toLowerCase().includes(needle) ||
        row.item.name.toLowerCase().includes(needle) ||
        row.warehouse.code.toLowerCase().includes(needle),
    );
  }, [balances, search]);

  const filteredReservations = useMemo(() => {
    let list = reservations;
    if (reservationStatusFilter === "ACTIVE") {
      list = list.filter((r) => r.status === "ACTIVE");
    }
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (r) =>
        r.item.sku.toLowerCase().includes(needle) ||
        r.item.name.toLowerCase().includes(needle) ||
        r.warehouse.code.toLowerCase().includes(needle) ||
        r.sourceType.toLowerCase().includes(needle) ||
        r.sourceId.toLowerCase().includes(needle),
    );
  }, [reservations, reservationStatusFilter, search]);

  const filteredMovements = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return movements;
    return movements.filter(
      (row) =>
        row.item.sku.toLowerCase().includes(needle) ||
        row.item.name.toLowerCase().includes(needle) ||
        row.warehouse.code.toLowerCase().includes(needle) ||
        row.movementType.toLowerCase().includes(needle) ||
        row.sourceType.toLowerCase().includes(needle),
    );
  }, [movements, search]);

  const paginatedBalances = useMemo(() => {
    const start = (balancePage - 1) * balancePageSize;
    return filteredBalances.slice(start, start + balancePageSize);
  }, [filteredBalances, balancePage, balancePageSize]);

  const paginatedReservations = useMemo(() => {
    const start = (reservationPage - 1) * reservationPageSize;
    return filteredReservations.slice(start, start + reservationPageSize);
  }, [filteredReservations, reservationPage, reservationPageSize]);

  const paginatedMovements = useMemo(() => {
    const start = (movementPage - 1) * movementPageSize;
    return filteredMovements.slice(start, start + movementPageSize);
  }, [filteredMovements, movementPage, movementPageSize]);

  function exportBalancesCsv() {
    downloadCsv(
      `inventory-balances-${todayJakarta()}.csv`,
      [
        "SKU Item",
        "Nama Item",
        "Kode Warehouse",
        "Nama Warehouse",
        "On Hand",
        "Reserved",
        "Blocked",
        "Available",
        "Moving Avg Cost",
        "Total Nilai",
      ],
      filteredBalances.map((row) => {
        const avail = new Decimal(row.onHand).minus(row.reserved).minus(row.blocked);
        const totalVal = row.averageUnitCost ? new Decimal(row.onHand).times(row.averageUnitCost).toFixed(2) : "";
        return [
          row.item.sku,
          row.item.name,
          row.warehouse.code,
          row.warehouse.name,
          row.onHand,
          row.reserved,
          row.blocked,
          avail.toString(),
          row.averageUnitCost ?? "",
          totalVal,
        ];
      }),
    );
  }

  function exportReservationsCsv() {
    downloadCsv(
      `inventory-reservations-${todayJakarta()}.csv`,
      [
        "SKU Item",
        "Nama Item",
        "Kode Warehouse",
        "Nama Warehouse",
        "Source Type",
        "Source Ref",
        "Reserved Qty",
        "Consumed Qty",
        "Remaining Qty",
        "Status",
        "Waktu Dibuat",
      ],
      filteredReservations.map((r) => {
        const remaining = new Decimal(r.quantity).minus(r.consumedQty);
        return [
          r.item.sku,
          r.item.name,
          r.warehouse.code,
          r.warehouse.name,
          r.sourceType,
          r.sourceId,
          r.quantity,
          r.consumedQty,
          remaining.toString(),
          r.status,
          formatDateTime(r.createdAt),
        ];
      }),
    );
  }

  function exportMovementsCsv() {
    downloadCsv(
      `inventory-movements-${todayJakarta()}.csv`,
      [
        "Waktu Mutasi",
        "SKU Item",
        "Nama Item",
        "Kode Warehouse",
        "Nama Warehouse",
        "Movement Type",
        "Quantity",
        "Unit Cost",
        "Source Type",
        "Source Ref",
      ],
      filteredMovements.map((m) => [
        formatDateTime(m.postedAt),
        m.item.sku,
        m.item.name,
        m.warehouse.code,
        m.warehouse.name,
        m.movementType,
        m.quantity,
        m.unitCost ?? "",
        m.sourceType,
        m.sourceId,
      ]),
    );
  }

  const totals = useMemo(() => {
    let reserved = new Decimal(0);
    let blocked = new Decimal(0);
    for (const row of balances) {
      reserved = reserved.plus(row.reserved);
      blocked = blocked.plus(row.blocked);
    }
    return { reserved: reserved.toString(), blocked: blocked.toString() };
  }, [balances]);

  const availableBalanceRows = useMemo(
    () =>
      balances.filter((row) =>
        new Decimal(row.onHand).minus(row.reserved).minus(row.blocked).greaterThan(0),
      ).length,
    [balances],
  );

  function resetForm() {
    setItemId("");
    setWarehouseId("");
    setFromWarehouseId("");
    setToWarehouseId("");
    setQuantity("");
    setUnitCost("");
    setReference("");
    setDirection("INCREASE");
    setBlockAction("BLOCK");
  }

  async function submitMovement(event: React.FormEvent<HTMLFormElement>, endpoint: string, body: unknown, successMessage: string) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Transaksi gagal diproses");
      setNotice(
        <span>
          {successMessage}{" "}
          {tab !== "balances" ? (
            <button
              type="button"
              className="ml-1.5 font-semibold underline underline-offset-2 hover:text-emerald-950"
              onClick={() => setTab("balances")}
            >
              Lihat saldo stok &rarr;
            </button>
          ) : null}
        </span>
      );
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaksi gagal diproses");
    } finally {
      setSaving(false);
    }
  }

  const commonSource = {
    sourceType: "MANUAL",
    sourceId: reference.trim() || `manual-${Date.now()}`,
    idempotencyKey: crypto.randomUUID(),
  };

  function handleReceipt(event: React.FormEvent<HTMLFormElement>) {
    void submitMovement(
      event,
      "/api/v1/inventory/receipts",
      { ...commonSource, itemId, warehouseId, quantity, unitCost: unitCost || undefined },
      "Penerimaan stok berhasil diposting.",
    );
  }

  function handleIssue(event: React.FormEvent<HTMLFormElement>) {
    void submitMovement(
      event,
      "/api/v1/inventory/issues",
      { ...commonSource, itemId, warehouseId, quantity },
      "Pengeluaran stok berhasil diposting.",
    );
  }

  function handleTransfer(event: React.FormEvent<HTMLFormElement>) {
    void submitMovement(
      event,
      "/api/v1/inventory/transfers",
      { ...commonSource, itemId, fromWarehouseId, toWarehouseId, quantity },
      "Transfer stok berhasil diposting.",
    );
  }

  function handleAdjustment(event: React.FormEvent<HTMLFormElement>) {
    void submitMovement(
      event,
      "/api/v1/inventory/adjustments",
      { ...commonSource, itemId, warehouseId, quantity, direction, unitCost: direction === "INCREASE" ? unitCost || undefined : undefined },
      "Penyesuaian stok berhasil diposting.",
    );
  }

  function handleBlock(event: React.FormEvent<HTMLFormElement>) {
    void submitMovement(
      event,
      "/api/v1/inventory/blocked-stock",
      { ...commonSource, itemId, warehouseId, quantity, action: blockAction },
      blockAction === "BLOCK" ? "Stok berhasil diblokir (karantina)." : "Blokir stok berhasil dibuka.",
    );
  }

  const itemOptions = items.map((item) => (
    <option key={item.id} value={item.id}>
      {item.sku} — {item.name}
    </option>
  ));

  const warehouseOptions = warehouses.map((warehouse) => (
    <option key={warehouse.id} value={warehouse.id}>
      {warehouse.code} — {warehouse.name}
    </option>
  ));

  const selectedItem = items.find((item) => item.id === itemId);

  const selectedBalance = useMemo(() => {
    if (!itemId) return null;
    const targetWhId = tab === "transfer" ? fromWarehouseId : warehouseId;
    if (!targetWhId) return null;
    return balances.find((b) => b.item.id === itemId && b.warehouse.id === targetWhId) ?? null;
  }, [balances, itemId, warehouseId, fromWarehouseId, tab]);

  const selectedAvailable = useMemo(() => {
    if (!selectedBalance) return null;
    const avail = new Decimal(selectedBalance.onHand).minus(selectedBalance.reserved).minus(selectedBalance.blocked);
    return avail.isPositive() ? avail : new Decimal(0);
  }, [selectedBalance]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Supply Chain & Inventory"
        title="Inventory & Stock Ledger"
        description="Saldo stok per gudang, reservasi material, transfer, penyesuaian (adjustment), dan karantina stok diblokir."
        actions={
          <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <StatGrid>
        <Stat label="Baris Saldo Stok" value={balances.length} />
        <Stat label="Saldo Tersedia" hint={`${availableBalanceRows} item memiliki stok tersedia`} value={availableBalanceRows} />
        <Stat label="Total Reserved" hint="Dipesan untuk MO / produksi" value={formatQuantity(totals.reserved)} />
        <Stat label="Total Blocked" hint="Karantina / diblokir" tone="warning" value={formatQuantity(totals.blocked)} />
      </StatGrid>

      <div className="flex gap-2 border-b border-slate-200 pb-2 overflow-x-auto scroll-area">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              tab === entry.id
                ? "bg-brand-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "balances" ? (
        <Card>
          <CardHeader
            title="Saldo stok"
            description={`${filteredBalances.length} dari ${balances.length} baris stok.`}
            actions={
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Cari barang atau gudang…" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportBalancesCsv}
                  disabled={filteredBalances.length === 0}
                  title="Unduh seluruh saldo stok sebagai file CSV"
                >
                  <Download aria-hidden className="size-3.5" />
                  Ekspor CSV
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat saldo stok…</div>
            ) : filteredBalances.length === 0 ? (
              <EmptyState title="Belum ada saldo stok" description="Posting penerimaan stok untuk memulai." />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th className="w-[140px]">SKU</Th>
                      <Th>Item / Barang</Th>
                      <Th className="w-[110px]">Gudang</Th>
                      <Th align="right" className="w-[90px]">On Hand</Th>
                      <Th align="right" className="w-[90px]">Reserved</Th>
                      <Th align="right" className="w-[90px]">Blocked</Th>
                      <Th align="right" className="w-[90px]">Available</Th>
                      <Th align="right" className="w-[120px]">Biaya Rata-rata</Th>
                      <Th align="right" className="w-[260px]">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedBalances.map((row) => {
                    const available = new Decimal(row.onHand).minus(row.reserved).minus(row.blocked);
                    return (
                      <Tr key={row.id}>
                        <Td className="tnum font-medium whitespace-nowrap">{row.item.sku}</Td>
                        <Td className="text-slate-600">{row.item.name}</Td>
                        <Td className="tnum text-slate-600 whitespace-nowrap">{row.warehouse.code}</Td>
                        <Td align="right" className="tnum text-slate-600 whitespace-nowrap">{formatQuantity(row.onHand)}</Td>
                        <Td align="right" className="tnum text-slate-600 whitespace-nowrap">{formatQuantity(row.reserved)}</Td>
                        <Td align="right" className="tnum text-slate-600 whitespace-nowrap">{formatQuantity(row.blocked)}</Td>
                        <Td align="right" className={`tnum font-medium whitespace-nowrap ${available.lessThanOrEqualTo(0) ? "text-red-600" : "text-slate-700"}`}>
                          {formatQuantity(available.toString())}
                        </Td>
                        <Td align="right" className="tnum text-slate-600 whitespace-nowrap">
                          {row.averageUnitCost ? formatMoney(row.averageUnitCost) : "—"}
                        </Td>
                        <Td align="right" className="whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="text-xs font-semibold text-brand-600 hover:underline"
                              onClick={() => {
                                setItemId(row.item.id);
                                setWarehouseId(row.warehouse.id);
                                setTab("adjust");
                              }}
                            >
                              Sesuaikan
                            </button>
                            <span className="text-slate-300">·</span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-amber-700 hover:underline"
                              onClick={() => {
                                setItemId(row.item.id);
                                setWarehouseId(row.warehouse.id);
                                setBlockAction(new Decimal(row.blocked).greaterThan(0) ? "UNBLOCK" : "BLOCK");
                                setTab("block");
                              }}
                            >
                              {new Decimal(row.blocked).greaterThan(0) ? "Buka blokir" : "Blokir"}
                            </button>
                            <span className="text-slate-300">·</span>
                            <button
                              type="button"
                              className="text-xs font-medium text-slate-600 hover:underline"
                              onClick={() => {
                                setItemId(row.item.id);
                                setFromWarehouseId(row.warehouse.id);
                                setToWarehouseId("");
                                setTab("transfer");
                              }}
                            >
                              Transfer
                            </button>
                            {new Decimal(row.reserved).greaterThan(0) ? (
                              <>
                                <span className="text-slate-300">·</span>
                                <button
                                  type="button"
                                  className="text-xs font-medium text-sky-700 hover:underline"
                                  onClick={() => {
                                    setSearch(row.item.sku);
                                    setTab("reservations");
                                  }}
                                >
                                  Reservasi
                                </button>
                              </>
                            ) : null}
                            <span className="text-slate-300">·</span>
                            <button
                              type="button"
                              className="text-xs font-medium text-brand-600 hover:underline"
                              onClick={() => {
                                setSearch(row.item.sku);
                                setTab("movements");
                              }}
                            >
                              Mutasi
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                currentPage={balancePage}
                pageSize={balancePageSize}
                totalItems={filteredBalances.length}
                onPageChange={setBalancePage}
                onPageSizeChange={setBalancePageSize}
              />
            </>
          )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "receipt" ? (
        <Card>
          <CardHeader
            title="Terima stok"
            description="Menerima barang ke gudang. Biaya satuan dipakai untuk moving average."
          />
          <CardBody>
            <form className="max-w-3xl space-y-4" onSubmit={handleReceipt}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Barang" required>
                  <Select required value={itemId} onChange={(event) => setItemId(event.target.value)}>
                    <option value="">Pilih barang</option>
                    {itemOptions}
                  </Select>
                </Field>
                <Field label="Gudang" required>
                  <Select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                    <option value="">Pilih gudang</option>
                    {warehouseOptions}
                  </Select>
                </Field>
                <Field label="Kuantitas" required hint={selectedItem?.baseUom ? `Satuan dasar: ${selectedItem.baseUom.code}` : undefined}>
                  <Input type="number" min="0.000001" step="0.000001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                </Field>
                <Field label="Biaya satuan" hint="Opsional, dalam Rupiah.">
                  <Input type="number" min="0" step="0.0001" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
                </Field>
              </div>
              <Field label="Referensi" hint="Nomor dokumen, surat jalan, atau catatan.">
                <Input placeholder="SJ-2026-001" value={reference} onChange={(event) => setReference(event.target.value)} />
              </Field>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? "Memposting…" : "Posting penerimaan"}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {tab === "issue" ? (
        <Card>
          <CardHeader title="Keluarkan stok" description="Pengeluaran stok manual di luar alur produksi dan pengiriman." />
          <CardBody>
            <form className="max-w-3xl space-y-4" onSubmit={handleIssue}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Barang" required>
                  <Select required value={itemId} onChange={(event) => setItemId(event.target.value)}>
                    <option value="">Pilih barang</option>
                    {itemOptions}
                  </Select>
                </Field>
                <Field label="Gudang" required>
                  <Select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                    <option value="">Pilih gudang</option>
                    {warehouseOptions}
                  </Select>
                </Field>
                <Field
                  label="Kuantitas"
                  required
                  hint={
                    selectedBalance
                      ? `Stok tersedia di gudang: ${formatQuantity(selectedAvailable?.toString() ?? "0")}.`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    max={selectedAvailable ? selectedAvailable.toString() : undefined}
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Referensi">
                <Input placeholder="Alasan atau nomor dokumen" value={reference} onChange={(event) => setReference(event.target.value)} />
              </Field>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? "Memposting…" : "Posting pengeluaran"}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {tab === "transfer" ? (
        <Card>
          <CardHeader title="Transfer antar gudang" description="Memindahkan stok tanpa mengubah total persediaan." />
          <CardBody>
            <form className="max-w-3xl space-y-4" onSubmit={handleTransfer}>
              <Field label="Barang" required>
                <Select required value={itemId} onChange={(event) => setItemId(event.target.value)}>
                  <option value="">Pilih barang</option>
                  {itemOptions}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Dari gudang" required>
                  <Select required value={fromWarehouseId} onChange={(event) => setFromWarehouseId(event.target.value)}>
                    <option value="">Pilih gudang asal</option>
                    {warehouseOptions}
                  </Select>
                </Field>
                <Field label="Ke gudang" required>
                  <Select required value={toWarehouseId} onChange={(event) => setToWarehouseId(event.target.value)}>
                    <option value="">Pilih gudang tujuan</option>
                    {warehouseOptions}
                  </Select>
                </Field>
                <Field
                  label="Kuantitas"
                  required
                  hint={
                    selectedBalance
                      ? `Tersedia di gudang asal: ${formatQuantity(selectedAvailable?.toString() ?? "0")}.`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    max={selectedAvailable ? selectedAvailable.toString() : undefined}
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Referensi">
                <Input placeholder="Nomor dokumen transfer" value={reference} onChange={(event) => setReference(event.target.value)} />
              </Field>
              <Button type="submit" variant="primary" loading={saving} disabled={fromWarehouseId !== "" && fromWarehouseId === toWarehouseId}>
                {saving ? "Memposting…" : "Posting transfer"}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {tab === "adjust" ? (
        <Card>
          <CardHeader title="Penyesuaian stok" description="Koreksi hasil hitung fisik. Setiap penyesuaian tercatat di ledger." />
          <CardBody>
            <form className="max-w-3xl space-y-4" onSubmit={handleAdjustment}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Barang" required>
                  <Select required value={itemId} onChange={(event) => setItemId(event.target.value)}>
                    <option value="">Pilih barang</option>
                    {itemOptions}
                  </Select>
                </Field>
                <Field label="Gudang" required>
                  <Select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                    <option value="">Pilih gudang</option>
                    {warehouseOptions}
                  </Select>
                </Field>
                <Field label="Arah penyesuaian" required>
                  <Select required value={direction} onChange={(event) => setDirection(event.target.value as "INCREASE" | "DECREASE")}>
                    <option value="INCREASE">Tambah stok</option>
                    <option value="DECREASE">Kurangi stok</option>
                  </Select>
                </Field>
                <Field
                  label="Kuantitas"
                  required
                  hint={
                    direction === "DECREASE" && selectedBalance
                      ? `Maksimal dapat dikurangi: ${formatQuantity(selectedAvailable?.toString() ?? "0")}.`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    max={direction === "DECREASE" && selectedAvailable ? selectedAvailable.toString() : undefined}
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Field>
                {direction === "INCREASE" ? (
                  <Field label="Biaya satuan" hint="Opsional untuk penambahan stok.">
                    <Input type="number" min="0" step="0.0001" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
                  </Field>
                ) : null}
              </div>
              <Field label="Alasan penyesuaian" required hint="Contoh: hasil stock opname, barang rusak.">
                <Input placeholder="Stock opname 2026-11" value={reference} onChange={(event) => setReference(event.target.value)} />
              </Field>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? "Memposting…" : "Posting penyesuaian"}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {tab === "block" ? (
        <Card>
          <CardHeader
            title="Blokir atau Buka Blokir Stok"
            description="Karantina stok rusak/investigasi atau lepaskan kembali ke stok tersedia tanpa mengubah saldo on-hand."
          />
          <CardBody>
            <form className="max-w-3xl space-y-4" onSubmit={handleBlock}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Barang" required>
                  <Select required value={itemId} onChange={(event) => setItemId(event.target.value)}>
                    <option value="">Pilih barang</option>
                    {itemOptions}
                  </Select>
                </Field>
                <Field label="Gudang" required>
                  <Select required value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                    <option value="">Pilih gudang</option>
                    {warehouseOptions}
                  </Select>
                </Field>
                <Field label="Tindakan" required>
                  <Select required value={blockAction} onChange={(event) => setBlockAction(event.target.value as "BLOCK" | "UNBLOCK")}>
                    <option value="BLOCK">Blokir stok (karantina)</option>
                    <option value="UNBLOCK">Buka blokir stok (lepaskan karantina)</option>
                  </Select>
                </Field>
                <Field
                  label="Kuantitas"
                  required
                  hint={
                    selectedBalance
                      ? blockAction === "BLOCK"
                        ? `Maksimal dapat diblokir: ${formatQuantity(selectedAvailable?.toString() ?? "0")} (stok tersedia).`
                        : `Maksimal dapat dibuka: ${formatQuantity(selectedBalance.blocked)} (stok diblokir).`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    max={
                      selectedBalance
                        ? blockAction === "BLOCK"
                          ? (selectedAvailable ? selectedAvailable.toString() : undefined)
                          : selectedBalance.blocked
                        : undefined
                    }
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Alasan / Referensi" required hint="Contoh: hasil uji lab ditolak, karantina batch, lulus inspeksi ulang.">
                <Input placeholder="Investigasi cacat kemasan" value={reference} onChange={(event) => setReference(event.target.value)} />
              </Field>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? "Memposting…" : blockAction === "BLOCK" ? "Posting pemblokiran stok" : "Posting pembukaan blokir"}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {tab === "reservations" ? (
        <Card>
          <CardHeader
            title="Reservasi stok"
            description={`${filteredReservations.length} dari ${reservations.length} reservasi stok.`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setReservationStatusFilter("ACTIVE");
                      setReservationPage(1);
                    }}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      reservationStatusFilter === "ACTIVE"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Aktif saja
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReservationStatusFilter("ALL");
                      setReservationPage(1);
                    }}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      reservationStatusFilter === "ALL"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Semua
                  </button>
                </div>
                <SearchInput value={search} onChange={setSearch} placeholder="Cari SKU, gudang, atau nomor sumber…" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportReservationsCsv}
                  disabled={filteredReservations.length === 0}
                  title="Unduh data reservasi stok sebagai file CSV"
                >
                  <Download aria-hidden className="size-3.5" />
                  Ekspor CSV
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat data reservasi…</div>
            ) : filteredReservations.length === 0 ? (
              <EmptyState
                title={search ? "Tidak ada reservasi yang cocok" : "Belum ada reservasi stok"}
                description={
                  search
                    ? "Coba ubah kata kunci pencarian atau filter status."
                    : "Reservasi stok dibuat otomatis saat Manufacturing Order (MO) dirilis atau melalui alokasi kebutuhan bahan."
                }
              />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th className="w-[140px]">SKU</Th>
                      <Th>Barang</Th>
                      <Th className="w-[100px]">Gudang</Th>
                      <Th className="w-[160px]">Sumber Reservasi</Th>
                      <Th align="right" className="w-[90px]">Dipesan</Th>
                      <Th align="right" className="w-[90px]">Terpakai</Th>
                      <Th align="right" className="w-[90px]">Sisa</Th>
                      <Th className="w-[100px]">Status</Th>
                      <Th align="right" className="w-[140px]">Waktu Dibuat</Th>
                      <Th align="right" className="w-[80px]">Aksi</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedReservations.map((reservation) => {
                      const remaining = new Decimal(reservation.quantity).minus(reservation.consumedQty);
                      return (
                        <Tr key={reservation.id}>
                          <Td className="tnum font-medium text-slate-700">{reservation.item.sku}</Td>
                          <Td className="text-slate-600">{reservation.item.name}</Td>
                          <Td className="tnum text-slate-600">{reservation.warehouse.code}</Td>
                          <Td className="text-slate-500 text-xs">
                            {humanize(reservation.sourceType)} · {reservation.sourceId}
                          </Td>
                          <Td align="right" className="tnum text-slate-600">
                            {formatQuantity(reservation.quantity)}
                          </Td>
                          <Td align="right" className="tnum text-slate-600">
                            {formatQuantity(reservation.consumedQty)}
                          </Td>
                          <Td align="right" className="tnum font-medium text-amber-700">
                            {formatQuantity(remaining.toString())}
                          </Td>
                          <Td>
                            <StatusBadge status={reservation.status} />
                          </Td>
                          <Td align="right" className="tnum text-slate-500">
                            {formatDateTime(reservation.createdAt)}
                          </Td>
                          <Td align="right">
                            {reservation.status === "ACTIVE" ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={releasingId === reservation.id}
                                onClick={() => {
                                  void handleReleaseReservation(reservation.id);
                                }}
                              >
                                Lepas
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={reservationPage}
                  pageSize={reservationPageSize}
                  totalItems={filteredReservations.length}
                  onPageChange={setReservationPage}
                  onPageSizeChange={setReservationPageSize}
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "movements" ? (
        <Card>
          <CardHeader
            title="Riwayat mutasi stok"
            description={`${filteredMovements.length} dari ${movements.length} mutasi stok.`}
            actions={
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Cari SKU, gudang, jenis, atau sumber…" />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportMovementsCsv}
                  disabled={filteredMovements.length === 0}
                  title="Unduh riwayat mutasi sebagai file CSV"
                >
                  <Download aria-hidden className="size-3.5" />
                  Ekspor CSV
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat mutasi…</div>
            ) : filteredMovements.length === 0 ? (
              <EmptyState
                title={search ? "Tidak ada mutasi yang cocok" : "Belum ada mutasi stok"}
                description={search ? "Coba ubah kata kunci pencarian Anda." : "Mutasi akan tercatat otomatis saat ada penerimaan, pengeluaran, atau transfer stok."}
              />
            ) : (
              <>
                <Table>
                  <TableHead>
                    <Tr>
                      <Th className="w-[150px]">Waktu Mutasi</Th>
                      <Th className="w-[140px]">SKU Barang</Th>
                      <Th className="w-[100px]">Gudang</Th>
                      <Th className="w-[110px]">Jenis Mutasi</Th>
                      <Th align="right" className="w-[100px]">Kuantitas</Th>
                      <Th align="right" className="w-[120px]">Biaya Satuan</Th>
                      <Th>Dokumen / Sumber</Th>
                    </Tr>
                  </TableHead>
                  <TableBody>
                    {paginatedMovements.map((movement) => (
                      <Tr key={movement.id}>
                        <Td className="tnum text-slate-500 whitespace-nowrap">{formatDateTime(movement.postedAt)}</Td>
                        <Td className="tnum font-medium text-slate-700 whitespace-nowrap">{movement.item.sku}</Td>
                        <Td className="tnum text-slate-600 whitespace-nowrap">{movement.warehouse.code}</Td>
                        <Td className="whitespace-nowrap">
                          <StatusBadge status={movement.movementType} />
                        </Td>
                        <Td align="right" className="tnum text-slate-600 whitespace-nowrap">{formatQuantity(movement.quantity)}</Td>
                        <Td align="right" className="tnum text-slate-600 whitespace-nowrap">{movement.unitCost ? formatMoney(movement.unitCost) : "—"}</Td>
                        <Td className="text-slate-500 text-xs truncate max-w-[200px]">{humanize(movement.sourceType)} · {movement.sourceId}</Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  currentPage={movementPage}
                  pageSize={movementPageSize}
                  totalItems={filteredMovements.length}
                  onPageChange={setMovementPage}
                  onPageSizeChange={setMovementPageSize}
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
