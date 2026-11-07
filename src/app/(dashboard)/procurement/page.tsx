"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";

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
  purchaseOrder: { number: string; supplier: { code: string; name: string } } | null;
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
  purchaseOrder: { id: string; number: string; supplier: { code: string } };
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        fetch("/api/v1/purchase-order-lines?limit=200"),
      ]);
      if (!poRes.ok) throw new Error("Gagal memuat pesan pembelian");
      if (!grRes.ok) throw new Error("Gagal memuat penerimaan barang");
      if (!supRes.ok) throw new Error("Gagal memuat supplier");
      if (!whRes.ok) throw new Error("Gagal memuat gudang");
      if (!itemRes.ok) throw new Error("Gagal memuat barang");
      if (!uomRes.ok) throw new Error("Gagal memuat satuan");
      if (!lineRes.ok) throw new Error("Gagal memuat baris PO");

      const [poJson, grJson, supJson, whJson, itemJson, uomJson, lineJson] = await Promise.all([
        poRes.json(), grRes.json(), supRes.json(), whRes.json(), itemRes.json(), uomRes.json(), lineRes.json(),
      ]);

      setPurchaseOrders((poJson.data as PurchaseOrder[] ?? []).map((po) => ({
        ...po,
        totalAmount: formatMoney(po.totalAmount),
      })));
      setGoodsReceipts(grJson.data ?? []);
      setSuppliers(supJson.data ?? []);
      setWarehouses((whJson.data ?? []).filter((w: Warehouse) => !w.isWip));
      setItems(itemJson.data ?? []);
      setUoms(uomJson.data ?? []);
      setPoLines(lineJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreatePO(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget as HTMLFormElement);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat pesan pembelian");
      setNotice("Pesan pembelian dibuat.");
      (event.currentTarget as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat pesan pembelian");
    }
  }

  async function handleCreateReceipt(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const body = {
      number: form.get("number"),
      purchaseOrderId: form.get("purchaseOrderId"),
      warehouseId: form.get("warehouseId"),
      idempotencyKey: form.get("idempotencyKey"),
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal mencatat penerimaan barang");
      setNotice("Penerimaan barang dicatat.");
      (event.currentTarget as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat penerimaan barang");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Rantai pasok"
        title="Pembelian"
        description="Pesan pembelian dan penerimaan barang."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            actions={
              <div className="flex items-end gap-2">
                <Input placeholder="Cari nomor PO…" className="w-[220px]" value="" onChange={() => {}} />
              </div>
            }
            description="Pesan pembelian dan baris itemnya."
            title="Pesan Pembelian"
          />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat…</div>
            ) : purchaseOrders.length === 0 ? (
              <EmptyState title="Belum ada pesan pembelian" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Supplier</Th>
                    <Th>Status</Th>
                    <Th align="right">Diharapkan</Th>
                    <Th align="right">Jumlah</Th>
                    <Th align="right">Terima</Th>
                    <Th align="right">Dibuat</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <Tr key={po.id}>
                      <Td className="font-medium tnum">{po.number}</Td>
                      <Td className="text-slate-600 tnum">{po.supplier ? `${po.supplier.code} · ${po.supplier.name}` : "—"}</Td>
                      <Td>{<StatusBadge status={po.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600">
                        {formatDate(po.expectedDelivery)}
                      </Td>
                      <Td align="right" className="tnum text-slate-600">{po.totalAmount}</Td>
                      <Td align="right" className="tnum text-slate-600">{po._count.receipts}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(po.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Buat Pesan Pembelian" />
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={handleCreatePO}>
              <Field label="Nomor PO" required>
                <Input name="number" placeholder="PO-2026-001" required />
              </Field>
              <Field label="Supplier" hint="Pilih supplier terdaftar" required>
                <Select name="supplierId" required>
                  <option value="">Pilih supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Gudang" hint="Gudang tujuan" required>
                <Select name="warehouseId" required>
                  <option value="">Pilih gudang</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Barang" required>
                <Select name="itemId" required>
                  <option value="">Pilih barang</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} — {it.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kuantitas" required>
                  <Input name="quantity" type="number" step="0.000001" required />
                </Field>
                <Field label="Biaya satuan" required>
                  <Input name="unitCost" type="number" step="0.0001" required />
                </Field>
                <Field label="Satuan" required>
                  <Select name="uomId" required>
                    <option value="">Pilih satuan</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Pengiriman diharapkan">
                  <Input name="expectedDelivery" type="datetime-local" />
                </Field>
              </div>
              <Button type="submit" variant="primary">Buat pesan pembelian</Button>
            </form>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Penerimaan Barang" />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat…</div>
            ) : goodsReceipts.length === 0 ? (
              <EmptyState title="Belum ada penerimaan barang" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Pesanan Pembelian</Th>
                    <Th>Supplier</Th>
                    <Th>Status</Th>
                    <Th align="right">Dicatet</Th>
                    <Th align="right">Dibuat</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {goodsReceipts.map((gr) => (
                    <Tr key={gr.id}>
                      <Td className="font-medium tnum">{gr.number}</Td>
                      <Td className="text-slate-600 tnum">{gr.purchaseOrder?.number ?? "—"}</Td>
                      <Td className="text-slate-600 tnum">
                        {gr.purchaseOrder?.supplier ? `${gr.purchaseOrder.supplier.code}` : "—"}
                      </Td>
                      <Td>{<StatusBadge status={gr.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatDate(gr.postedAt)}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(gr.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Catat Penerimaan Barang" />
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={handleCreateReceipt}>
              <Field label="Nomor penerimaan" required>
                <Input name="number" placeholder="GR-2026-001" required />
              </Field>
              <Field label="Pesanan pembelian" hint="Pilih PO yang disetujui" required>
                <Select name="purchaseOrderId" required>
                  <option value="">Pilih pesan pembelian</option>
                  {purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.number} · {po.supplier?.name ?? "—"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Gudang" hint="Gudang penerimaan" required>
                <Select name="warehouseId" required>
                  <option value="">Pilih gudang</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kunci idempotensi" hint="Kunci unik agar percobaan ulang aman" required>
                <Input name="idempotencyKey" placeholder="gr-2026-001-abc" required />
              </Field>
              <Field label="Baris PO" hint="Hanya baris PO yang belum terpenuhi sepenuhnya" required>
                <Select name="purchaseOrderLineId" required>
                  <option value="">Pilih baris PO</option>
                  {poLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      PO {line.purchaseOrder.number} · baris {line.sequence} · {line.item.sku}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Kuantitas terima" required>
                <Input name="quantity" type="number" step="0.000001" required />
              </Field>
              <Button type="submit" variant="primary">Catat penerimaan barang</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
