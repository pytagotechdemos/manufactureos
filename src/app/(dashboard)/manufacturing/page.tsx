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
import { formatDate, formatQuantity } from "@/lib/format";

type MoRow = {
  id: string;
  number: string;
  item: { sku: string; name: string };
  quantity: string;
  status: string;
  warehouseId: string;
  wipWarehouseId: string;
  createdAt: string;
};

type Warehouse = { id: string; code: string; name: string; isWip: boolean };
type Item = { id: string; sku: string; name: string };

export default function ManufacturingPage() {
  const [orders, setOrders] = useState<MoRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [moRes, whRes, itemRes] = await Promise.all([
        fetch("/api/v1/manufacturing/orders?limit=100"),
        fetch("/api/v1/warehouses"),
        fetch("/api/v1/items?limit=100"),
      ]);
      if (!moRes.ok || !whRes.ok || !itemRes.ok) throw new Error("Gagal memuat data produksi");
      const [moJson, whJson, itemJson] = await Promise.all([moRes.json(), whRes.json(), itemRes.json()]);
      setOrders(moJson.data ?? []);
      setWarehouses(whJson.data ?? []);
      setItems(itemJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data produksi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nonWip = warehouses.filter((w) => !w.isWip);
  const wip = warehouses.filter((w) => w.isWip);

  async function handleCreateMo(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice("Membuat MO memerlukan rekomendasi MRP yang disetujui. Jalankan MRP di Perencanaan terlebih dahulu, lalu rilis MO dari rekomendasi yang dihasilkan.");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi"
        title="Produksi"
        description="Pesanan produksi, pesanan kerja dan hasil produksi."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="info" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Pesanan Produksi" />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat…</div>
            ) : orders.length === 0 ? (
              <EmptyState title="Belum ada pesanan produksi" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor</Th>
                    <Th>Barang</Th>
                    <Th align="right">Kuantitas</Th>
                    <Th>Status</Th>
                    <Th align="right">Gudang</Th>
                    <Th align="right">Dibuat</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {orders.map((mo) => (
                    <Tr key={mo.id}>
                      <Td className="font-medium tnum">{mo.number}</Td>
                      <Td className="text-slate-600 tnum">{mo.item.sku} — {mo.item.name}</Td>
                      <Td align="right" className="tnum text-slate-600">{formatQuantity(mo.quantity)}</Td>
                      <Td>{<StatusBadge status={mo.status} />}</Td>
                      <Td align="right" className="tnum text-slate-600 tnum">
                        {mo.warehouseId.slice(0, 8)}…
                      </Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(mo.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Buat Pesanan Produksi" description="Memerlukan rekomendasi MRP terlebih dahulu." />
          <CardBody className="space-y-4">
            <Alert tone="info">
              Buat MO dihubungkan ke alur rekomendasi MRP. Pilih barang dan kuantitas di bawah — penautan rekomendasi akan diaktifkan setelah modul Perencanaan menghasilkan suatu run.
            </Alert>
            <form className="space-y-4" onSubmit={handleCreateMo}>
              <Field label="Barang" required>
                <Select name="itemId" required>
                  <option value="">Pilih barang</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.sku} — {it.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Kuantitas rencana" required>
                <Input name="quantity" type="number" step="0.000001" required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Gudang barang jadi" required>
                  <Select name="warehouseId" required>
                    <option value="">Pilih gudang</option>
                    {nonWip.map((w) => (
                      <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Gudang WIP" required>
                  <Select name="wipWarehouseId" required>
                    <option value="">Pilih gudang WIP</option>
                    {wip.map((w) => (
                      <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" variant="primary">Buat pesanan produksi</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
