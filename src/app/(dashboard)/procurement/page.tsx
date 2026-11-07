"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";

type PurchaseOrder = {
  id: string;
  number: string;
  supplier: { code: string; name: string } | null;
  status: string;
  expectedDelivery: string | null;
  totalAmount: string;
  createdAt: string;
  lines: { id: string; item: { sku: string; name: string }; orderedQty: string; receivedQty: string }[];
  _count: { receipts: number };
};

type GoodsReceipt = {
  id: string;
  number: string;
  purchaseOrder: { number: string; supplier: { code: string; name: string } | null } | null;
  status: string;
  postedAt: string | null;
  createdAt: string;
};

type Supplier = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string; isWip: boolean };
type Item = { id: string; sku: string; name: string; baseUom: { code: string } | null };
type Uom = { id: string; code: string; name: string };
type PoLine = {
  id: string;
  sequence: number;
  orderedQty: string;
  receivedQty: string;
  item: { sku: string; name: string };
  purchaseOrder: { id: string; number: string; supplier: { code: string } | null };
};

export default function ProcurementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [poLines, setPoLines] = useState<PoLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [grPurchaseOrderId, setGrPurchaseOrderId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, grRes, supRes, whRes, itemRes, uomRes, lineRes] = await Promise.all([
        fetch("/api/v1/procurement/purchase-orders?limit=100"),
        fetch("/api/v1/procurement/goods-receipts?limit=100"),
        fetch("/api/v1/suppliers"),
        fetch("/api/v1/warehouses"),
        fetch("/api/v1/items?limit=100"),
        fetch("/api/v1/uoms"),
        fetch("/api/v1/purchase-order-lines?limit=100"),
      ]);
      if (!poRes.ok || !grRes.ok || !supRes.ok || !whRes.ok || !itemRes.ok || !uomRes.ok || !lineRes.ok) {
        throw new Error("Gagal memuat data pembelian");
      }
      const [poJson, grJson, supJson, whJson, itemJson, uomJson, lineJson] = await Promise.all([
        poRes.json(), grRes.json(), supRes.json(), whRes.json(), itemRes.json(), uomRes.json(), lineRes.json(),
      ]);

      setPurchaseOrders(poJson.data ?? []);
      setGoodsReceipts(grJson.data ?? []);
      setSuppliers(supJson.data ?? []);
      setWarehouses((whJson.data ?? []).filter((warehouse: Warehouse) => !warehouse.isWip));
      setItems(itemJson.data ?? []);
      setUoms(uomJson.data ?? []);
      setPoLines(lineJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data pembelian");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return purchaseOrders;
    return purchaseOrders.filter(
      (order) =>
        order.number.toLowerCase().includes(needle) ||
        (order.supplier?.name ?? "").toLowerCase().includes(needle) ||
        (order.supplier?.code ?? "").toLowerCase().includes(needle),
    );
  }, [purchaseOrders, search]);

  const grLines = useMemo(
    () =>
      poLines.filter(
        (line) =>
          line.purchaseOrder.id === grPurchaseOrderId &&
          Number(line.orderedQty) > Number(line.receivedQty),
      ),
    [poLines, grPurchaseOrderId],
  );

  async function handleCreatePO(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSaving(true);
    const form = new FormData(formElement);
    const body = {
      number: form.get("number"),
      supplierId: form.get("supplierId"),
      warehouseId: form.get("warehouseId"),
      expectedDelivery: form.get("expectedDelivery") || undefined,
      lines: [
        {
          itemId: form.get("itemId"),
          quantity: form.get("quantity"),
          unitCost: form.get("unitCost"),
          uomId: form.get("uomId"),
        },
      ],
    };
    try {
      const res = await fetch("/api/v1/procurement/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membuat pesanan pembelian");
      setNotice("Pesanan pembelian dibuat sebagai draf. Setujui untuk mengizinkan penerimaan.");
      formElement.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pesanan pembelian");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSaving(true);
    const form = new FormData(formElement);
    const body = {
      number: form.get("number"),
      purchaseOrderId: form.get("purchaseOrderId"),
      warehouseId: form.get("warehouseId"),
      idempotencyKey: crypto.randomUUID(),
      lines: [
        {
          purchaseOrderLineId: form.get("purchaseOrderLineId"),
          quantity: form.get("quantity"),
        },
      ],
    };
    try {
      const res = await fetch("/api/v1/procurement/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal mencatat penerimaan barang");
      setNotice("Penerimaan barang dicatat sebagai draf. Posting untuk menambah stok.");
      formElement.reset();
      setGrPurchaseOrderId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat penerimaan barang");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(order: PurchaseOrder) {
    setActingId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/purchase-orders/${order.id}/approve`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menyetujui pesanan pembelian");
      setNotice(`${order.number} disetujui.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui pesanan pembelian");
    } finally {
      setActingId(null);
    }
  }

  async function handlePostReceipt(receipt: GoodsReceipt) {
    setActingId(receipt.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/procurement/goods-receipts/${receipt.id}/post`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memposting penerimaan barang");
      setNotice(`${receipt.number} diposting ke stok.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memposting penerimaan barang");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Rantai pasok"
        title="Pembelian"
        description="Pesanan pembelian, persetujuan, penerimaan barang, dan posting ke stok."
        actions={
          <Button variant="secondary" onClick={() => { void load(); }} loading={loading}>
            Muat ulang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Card>
        <CardHeader
          title="Pesanan pembelian"
          description={`${filteredOrders.length} dari ${purchaseOrders.length} pesanan.`}
          actions={<SearchInput value={search} onChange={setSearch} placeholder="Cari nomor atau supplier…" />}
        />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Memuat pesanan pembelian…</div>
          ) : filteredOrders.length === 0 ? (
            <EmptyState title="Belum ada pesanan pembelian" description="Buat pesanan pembelian baru di panel kanan." />
          ) : (
            <Table>
              <TableHead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Supplier</Th>
                  <Th>Status</Th>
                  <Th align="right">Baris</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Diharapkan</Th>
                  <Th align="right">Terima</Th>
                  <Th align="right">Aksi</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {filteredOrders.map((order) => (
                  <Tr key={order.id}>
                    <Td className="tnum font-medium">{order.number}</Td>
                    <Td className="text-slate-600 tnum">
                      {order.supplier ? `${order.supplier.code} · ${order.supplier.name}` : "—"}
                    </Td>
                    <Td>{<StatusBadge status={order.status} />}</Td>
                    <Td align="right" className="tnum text-slate-600">{order.lines?.length ?? 0}</Td>
                    <Td align="right" className="tnum text-slate-600">{formatMoney(order.totalAmount)}</Td>
                    <Td align="right" className="tnum text-slate-600">{formatDate(order.expectedDelivery)}</Td>
                    <Td align="right" className="tnum text-slate-600">{order._count.receipts}</Td>
                    <Td align="right">
                      {order.status === "DRAFT" ? (
                        <Button
                          size="sm"
                          variant="primary"
                          loading={actingId === order.id}
                          onClick={() => { void handleApprove(order); }}
                        >
                          Setujui
                        </Button>
                      ) : (
                        <span className="text-[12px] text-slate-400">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Buat pesanan pembelian" description="Pesanan dibuat sebagai draf dan harus disetujui sebelum diterima." />
          <CardBody>
            <form className="space-y-4" onSubmit={handleCreatePO}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nomor PO" required>
                  <Input name="number" placeholder="PO-2026-001" required />
                </Field>
                <Field label="Supplier" required>
                  <Select name="supplierId" required>
                    <option value="">Pilih supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.code} — {supplier.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Gudang tujuan" required>
                  <Select name="warehouseId" required>
                    <option value="">Pilih gudang</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.code} — {warehouse.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Pengiriman diharapkan">
                  <Input name="expectedDelivery" type="date" />
                </Field>
                <Field label="Barang" required>
                  <Select name="itemId" required>
                    <option value="">Pilih barang</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} — {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Satuan" required>
                  <Select name="uomId" required>
                    <option value="">Pilih satuan</option>
                    {uoms.map((uom) => (
                      <option key={uom.id} value={uom.id}>
                        {uom.code} — {uom.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Kuantitas" required>
                  <Input name="quantity" type="number" min="0.000001" step="0.000001" required />
                </Field>
                <Field label="Biaya satuan" required>
                  <Input name="unitCost" type="number" min="0" step="0.0001" required />
                </Field>
              </div>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? "Menyimpan…" : "Buat pesanan pembelian"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Catat penerimaan barang" description="Pilih PO yang disetujui, lalu posting untuk menambah stok." />
          <CardBody>
            <form className="space-y-4" onSubmit={handleCreateReceipt}>
              <Field label="Nomor penerimaan" required>
                <Input name="number" placeholder="GR-2026-001" required />
              </Field>
              <Field label="Pesanan pembelian" required>
                <Select
                  name="purchaseOrderId"
                  required
                  value={grPurchaseOrderId}
                  onChange={(event) => setGrPurchaseOrderId(event.target.value)}
                >
                  <option value="">Pilih pesanan pembelian</option>
                  {purchaseOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.number} · {order.supplier?.name ?? "—"} · {order.status}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Gudang penerimaan" required>
                <Select name="warehouseId" required>
                  <option value="">Pilih gudang</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Baris PO"
                required
                hint={
                  grPurchaseOrderId
                    ? grLines.length === 0
                      ? "Semua baris PO ini sudah diterima penuh."
                      : `${grLines.length} baris belum terpenuhi.`
                    : "Pilih pesanan pembelian terlebih dahulu."
                }
              >
                <Select name="purchaseOrderLineId" required disabled={grLines.length === 0}>
                  <option value="">Pilih baris PO</option>
                  {grLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      Baris {line.sequence} · {line.item.sku} · sisa {formatQuantity(String(Number(line.orderedQty) - Number(line.receivedQty)))}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kuantitas terima" required>
                <Input name="quantity" type="number" min="0.000001" step="0.000001" required />
              </Field>
              <Button type="submit" variant="primary" loading={saving} disabled={grLines.length === 0}>
                {saving ? "Menyimpan…" : "Catat penerimaan"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Penerimaan barang" description="Draf penerimaan harus diposting agar stok bertambah." />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Memuat penerimaan…</div>
          ) : goodsReceipts.length === 0 ? (
            <EmptyState compact title="Belum ada penerimaan barang" />
          ) : (
            <Table>
              <TableHead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Pesanan pembelian</Th>
                  <Th>Supplier</Th>
                  <Th>Status</Th>
                  <Th align="right">Diposting</Th>
                  <Th align="right">Dibuat</Th>
                  <Th align="right">Aksi</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {goodsReceipts.map((receipt) => (
                  <Tr key={receipt.id}>
                    <Td className="tnum font-medium">{receipt.number}</Td>
                    <Td className="tnum text-slate-600">{receipt.purchaseOrder?.number ?? "—"}</Td>
                    <Td className="tnum text-slate-600">{receipt.purchaseOrder?.supplier?.code ?? "—"}</Td>
                    <Td>{<StatusBadge status={receipt.status} />}</Td>
                    <Td align="right" className="tnum text-slate-600">{formatDate(receipt.postedAt)}</Td>
                    <Td align="right" className="tnum text-slate-500">{formatDate(receipt.createdAt)}</Td>
                    <Td align="right">
                      {receipt.status === "DRAFT" ? (
                        <Button
                          size="sm"
                          variant="primary"
                          loading={actingId === receipt.id}
                          onClick={() => { void handlePostReceipt(receipt); }}
                        >
                          Posting
                        </Button>
                      ) : (
                        <span className="text-[12px] text-slate-400">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
