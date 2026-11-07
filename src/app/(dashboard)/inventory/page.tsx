"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";

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

type Warehouse = { id: string; code: string; name: string };
type Item = { id: string; sku: string; name: string; baseUom: { code: string } | null };

type Tab = "balances" | "receipt" | "issue" | "transfer" | "adjust" | "movements";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "balances", label: "Saldo stok" },
  { id: "receipt", label: "Terima" },
  { id: "issue", label: "Keluar" },
  { id: "transfer", label: "Transfer" },
  { id: "adjust", label: "Penyesuaian" },
  { id: "movements", label: "Riwayat mutasi" },
];

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("balances");
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [direction, setDirection] = useState<"INCREASE" | "DECREASE">("INCREASE");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balanceRes, masterRes, movementRes] = await Promise.all([
        fetch("/api/v1/inventory/balances"),
        fetch("/api/v1/inventory/master-data"),
        fetch("/api/v1/inventory/movements?limit=100"),
      ]);
      if (!balanceRes.ok || !masterRes.ok || !movementRes.ok) throw new Error("Gagal memuat data inventori");
      const [balanceJson, masterJson, movementJson] = await Promise.all([
        balanceRes.json(),
        masterRes.json(),
        movementRes.json(),
      ]);
      setBalances(balanceJson.data ?? []);
      setMovements(movementJson.data ?? []);
      const master = masterJson.data ?? {};
      setItems(master.items ?? []);
      setWarehouses(master.warehouses ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data inventori");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const totals = useMemo(
    () =>
      balances.reduce(
        (acc, row) => {
          acc.onHand += Number(row.onHand);
          acc.reserved += Number(row.reserved);
          acc.blocked += Number(row.blocked);
          return acc;
        },
        { onHand: 0, reserved: 0, blocked: 0 },
      ),
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
      setNotice(successMessage);
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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventori"
        title="Persediaan"
        description="Saldo stok per gudang serta transaksi penerimaan, pengeluaran, transfer, dan penyesuaian."
        actions={
          <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <StatGrid>
        <Stat label="Baris stok" value={balances.length} />
        <Stat label="Tersedia" hint="unit" value={formatQuantity(totals.onHand)} />
        <Stat label="Dipesan" hint="unit" value={formatQuantity(totals.reserved)} />
        <Stat label="Diblokir" hint="unit" tone="warning" value={formatQuantity(totals.blocked)} />
      </StatGrid>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((entry) => (
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

      {tab === "balances" ? (
        <Card>
          <CardHeader
            title="Saldo stok"
            description={`${filteredBalances.length} dari ${balances.length} baris stok.`}
            actions={<SearchInput value={search} onChange={setSearch} placeholder="Cari barang atau gudang…" />}
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat saldo stok…</div>
            ) : filteredBalances.length === 0 ? (
              <EmptyState title="Belum ada saldo stok" description="Posting penerimaan stok untuk memulai." />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>SKU</Th>
                    <Th>Barang</Th>
                    <Th>Gudang</Th>
                    <Th align="right">On hand</Th>
                    <Th align="right">Dipesan</Th>
                    <Th align="right">Diblokir</Th>
                    <Th align="right">Tersedia</Th>
                    <Th align="right">Biaya rata-rata</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {filteredBalances.map((row) => {
                    const available = Number(row.onHand) - Number(row.reserved) - Number(row.blocked);
                    return (
                      <Tr key={row.id}>
                        <Td className="tnum font-medium">{row.item.sku}</Td>
                        <Td className="text-slate-600">{row.item.name}</Td>
                        <Td className="tnum text-slate-600">{row.warehouse.code}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(row.onHand)}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(row.reserved)}</Td>
                        <Td align="right" className="tnum text-slate-600">{formatQuantity(row.blocked)}</Td>
                        <Td align="right" className={`tnum font-medium ${available <= 0 ? "text-red-600" : "text-slate-700"}`}>
                          {formatQuantity(String(Math.max(available, 0)))}
                        </Td>
                        <Td align="right" className="tnum text-slate-600">
                          {row.averageUnitCost ? formatMoney(row.averageUnitCost) : "—"}
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
                <Field label="Kuantitas" required>
                  <Input type="number" min="0.000001" step="0.000001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
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
                <Field label="Kuantitas" required>
                  <Input type="number" min="0.000001" step="0.000001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
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
                <Field label="Kuantitas" required>
                  <Input type="number" min="0.000001" step="0.000001" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
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

      {tab === "movements" ? (
        <Card>
          <CardHeader title="Riwayat mutasi stok" description="100 mutasi terakhir dari seluruh gudang." />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat mutasi…</div>
            ) : movements.length === 0 ? (
              <EmptyState title="Belum ada mutasi stok" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Waktu</Th>
                    <Th>Barang</Th>
                    <Th>Gudang</Th>
                    <Th>Jenis</Th>
                    <Th align="right">Kuantitas</Th>
                    <Th align="right">Biaya satuan</Th>
                    <Th>Sumber</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {movements.map((movement) => (
                    <Tr key={movement.id}>
                      <Td className="tnum text-slate-500">{formatDate(movement.postedAt)}</Td>
                      <Td className="tnum text-slate-700">{movement.item.sku}</Td>
                      <Td className="tnum text-slate-600">{movement.warehouse.code}</Td>
                      <Td>
                        <StatusBadge status={movement.movementType} />
                      </Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(movement.quantity)}</Td>
                      <Td align="right" className="tnum text-slate-600">{movement.unitCost ? formatMoney(movement.unitCost) : "—"}</Td>
                      <Td className="text-slate-500">{humanize(movement.sourceType)} · {movement.sourceId}</Td>
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
