"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type CostRecord = {
  moNumber: string;
  itemSku: string;
  estimatedCost: string | null;
  actualCost: string | null;
  variance: string | null;
  status: string;
};

export default function ReportsPage() {
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/orders", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Gagal memuat data biaya");
      const json = await res.json();
      type MoRaw = { number: string; item?: { sku: string | null }; status: string };
      setCosts((json.data as MoRaw[] ?? []).map((mo) => ({
        moNumber: mo.number,
        itemSku: mo.item?.sku ?? "-",
        estimatedCost: "-",
        actualCost: "-",
        variance: "-",
        status: mo.status,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data biaya");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Biaya & Laporan"
        title="Biaya & Laporan"
        description="Lihat estimasi biaya produksi, aktual, dan analisis variansi."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}

      {loading ? (
        <div className="p-8 text-center text-slate-500">Memuat data biaya…</div>
      ) : costs.length === 0 ? (
        <EmptyState title="Belum ada catatan biaya produksi" />
      ) : (
        <Card>
          <CardHeader title="Ringkasan Biaya Produksi" />
          <CardBody className="p-0">
            <Table>
              <TableHead>
                <Tr>
                  <Th>Nomor MO</Th>
                  <Th>SKU Barang</Th>
                  <Th align="right">Estimasi</Th>
                  <Th align="right">Aktual</Th>
                  <Th align="right">Variansi</Th>
                  <Th>Status</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {costs.map((c) => (
                  <Tr key={c.moNumber}>
                    <Td className="font-medium tnum">{c.moNumber}</Td>
                    <Td className="text-slate-600 tnum">{c.itemSku}</Td>
                    <Td align="right" className="tnum text-slate-600">{c.estimatedCost ?? "0.00"}</Td>
                    <Td align="right" className="tnum text-slate-600">{c.actualCost ?? "0.00"}</Td>
                    <Td align="right" className="tnum text-slate-600">{c.variance ?? "0.00"}</Td>
                    <Td>{c.status}</Td>
                  </Tr>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Tindakan Cepat" />
        <CardBody className="space-y-3">
          <Button className="w-full">Lihat Laporan Detail Biaya</Button>
          <Button className="w-full">Ekspor Analisis Variansi</Button>
          <Button className="w-full">Lihat Nilai WIP</Button>
          <Button className="w-full">Lihat Nilai Inventori</Button>
        </CardBody>
      </Card>
    </div>
  );
}
