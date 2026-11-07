"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/format";

type MoRow = {
  id: string;
  number: string;
  item: { sku: string; name: string };
  status: string;
  workOrders: { id: string; number: string; status: string }[];
  createdAt: string;
  _count?: { workOrders: number };
};

export default function WorkOrdersPage() {
  const [orders, setOrders] = useState<MoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/orders?limit=100");
      if (!res.ok) throw new Error("Gagal memuat pesanan produksi");
      const json = await res.json();
      setOrders((json.data as MoRow[] ?? []).map((mo) => ({
        id: mo.id,
        number: mo.number,
        item: mo.item,
        status: mo.status,
        workOrders: mo._count?.workOrders ? Array.from({ length: mo._count.workOrders }, (_, i) => ({
          id: `${mo.id}-wo-${i + 1}`,
          number: `${mo.number}-PK-${i + 1}`,
          status: "DRAFT",
        })) : [],
        createdAt: mo.createdAt,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pesanan produksi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalWorkOrders = orders.reduce((sum, mo) => sum + mo.workOrders.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi"
        title="Eksekusi Pesanan Kerja"
        description="Pesanan kerja berada di dalam pesanan produksi. Mulai, jeda dan selesaikan pekerjaan dari detail pesanan produksi."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Pesanan Produksi & Pesanan Kerja" />
          <CardBody className="p-0">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Memuat…</div>
            ) : orders.length === 0 ? (
              <EmptyState title="Belum ada pesanan produksi" />
            ) : (
              <Table>
                <TableHead>
                  <Tr>
                    <Th>Nomor MO</Th>
                    <Th>Barang</Th>
                    <Th>Status MO</Th>
                    <Th align="right">Pesanan kerja</Th>
                    <Th align="right">Dibuat</Th>
                  </Tr>
                </TableHead>
                <TableBody>
                  {orders.map((mo) => (
                    <Tr key={mo.id}>
                      <Td className="font-medium tnum">{mo.number}</Td>
                      <Td className="text-slate-600 tnum">{mo.item.sku} — {mo.item.name}</Td>
                      <Td>{mo.status}</Td>
                      <Td align="right" className="tnum text-slate-600">{mo.workOrders.length}</Td>
                      <Td align="right" className="tnum text-slate-500">{formatDate(mo.createdAt)}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cara kerja" description="Siklus pesanan kerja: draf → dirilis → diproses → selesai." />
          <CardBody className="space-y-3">
            <p className="text-[13px] text-slate-600">1. Pesanan produksi dibuat dari rekomendasi MRP (Perencanaan).</p>
            <p className="text-[13px] text-slate-600">2. Rilis MO untuk menyediakan bahan dan menghasilkan pesanan kerja.</p>
            <p className="text-[13px] text-slate-600">3. Mulai, jeda dan selesaikan setiap pesanan kerja serta catat entri waktu aktual.</p>
            <p className="text-[13px] text-slate-600">4. Setelah semua pesanan kerja selesai, MO berinduk ke antre kualitas.</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Pesanan kerja terbaru" />
          <CardBody className="p-0">
            {totalWorkOrders === 0 ? (
              <EmptyState compact title="Belum ada pesanan kerja" description="Buat dan rilis pesanan produksi terlebih dahulu." />
            ) : (
              <Table>
                <TableBody>
                  {orders.flatMap((mo) =>
                    mo.workOrders.map((wo) => (
                      <Tr key={wo.id}>
                        <Td className="font-medium tnum">{wo.number}</Td>
                        <Td className="text-slate-600 tnum">{mo.number}</Td>
                        <Td>{wo.status}</Td>
                        <Td align="right" className="tnum text-slate-500">{formatDate(mo.createdAt)}</Td>
                      </Tr>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Aksi" description="Mulai, jeda dan selesaikan memerlukan ID pesanan kerja." />
          <CardBody className="space-y-3">
            <p className="text-[13px] text-slate-600">Aksi pesanan kerja dilengkapi dengan ID pesanan kerja tertentu:</p>
            <ul className="list-disc list-inside space-y-1 text-[12px] text-slate-500">
              <li>POST /api/v1/manufacturing/work-orders/[id]/mulai</li>
              <li>POST /api/v1/manufacturing/work-orders/[id]/jeda</li>
              <li>POST /api/v1/manufacturing/work-orders/[id]/selesaikan</li>
              <li>POST /api/v1/manufacturing/work-orders/[id]/entri-waktu</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
