"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type CostRecord = {
  moNumber: string;
  itemSku: string;
  status: string;
  estimatedCost: string | null;
  actualCost: string | null;
  variance: string | null;
};

export default function ReportsPage() {
  const [costs, setCosts] = useState<CostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manufacturing/orders?limit=200", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Gagal memuat data biaya");
      const json = await res.json();
      type MoRaw = { number: string; item?: { sku: string | null }; status: string; id: string };
      const mos: MoRaw[] = json.data ?? [];

      const records: CostRecord[] = [];
      for (const mo of mos) {
        let estimated: string | null = null;
        let actual: string | null = null;
        try {
          const costRes = await fetch(`/api/v1/manufacturing/orders/${mo.id}/costs`, {
            headers: { Accept: "application/json" },
          });
          if (costRes.ok) {
            const costJson = await costRes.json();
            type CostRow = { type: string; materialCost: string; laborCost: string; overheadCost: string; totalCost: string };
            const rows: CostRow[] = costJson.data ?? [];
            const estimate = rows.find((r) => r.type === "ESTIMATE");
            const actualRow = rows.find((r) => r.type === "ACTUAL");
            estimated = estimate?.totalCost ?? null;
            actual = actualRow?.totalCost ?? null;
          }
        } catch {
          // Biaya belum dihitung untuk MO ini — biarkan null
        }
        records.push({
          moNumber: mo.number,
          itemSku: mo.item?.sku ?? "-",
          status: mo.status,
          estimatedCost: estimated,
          actualCost: actual,
          variance: estimated !== null && actual !== null
            ? (Number(actual) - Number(estimated)).toFixed(2)
            : null,
        });
      }

      setCosts(records);
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
        <>
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
                      <Td align="right" className="tnum text-slate-600">{c.estimatedCost ?? "—"}</Td>
                      <Td align="right" className="tnum text-slate-600">{c.actualCost ?? "—"}</Td>
                      <Td align="right" className={`tnum text-slate-600 ${c.variance ? (Number(c.variance) > 0 ? "text-red-600" : "text-emerald-600") : ""}`}>
                        {c.variance ?? "—"}
                      </Td>
                      <Td>{<StatusBadge status={c.status} />}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tindakan Cepat" />
            <CardBody className="space-y-3">
              <Button className="w-full">Lihat Laporan Detail Biaya</Button>
              <Button className="w-full">Ekspor Analisis Variansi</Button>
              <Button className="w-full">Lihat Nilai WIP</Button>
              <Button className="w-full">Lihat Nilai Inventori</Button>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
