"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { formatQuantity, formatMoney } from "@/lib/format";

type BalanceRow = {
  id: string;
  item: { id: string; sku: string; name: string; baseUom: { code: string } | null };
  warehouse: { id: string; code: string; name: string };
  onHand: string;
  reserved: string;
  blocked: string;
  available: string;
  averageUnitCost: string | null;
};

type RawBalanceRow = Omit<BalanceRow, "available">;

export default function InventoryPage() {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/inventory/balances?limit=200", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Gagal memuat saldo stok");
      const json = await res.json();
      setBalances((json.data as RawBalanceRow[] ?? []).map((row) => ({
        ...row,
        available:
          Number(row.onHand) - Number(row.reserved) - Number(row.blocked) < 0
            ? "0"
            : String(Number(row.onHand) - Number(row.reserved) - Number(row.blocked)),
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat saldo stok");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = balances.filter(
    (row) =>
      row.item.sku.toLowerCase().includes(search.toLowerCase()) ||
      row.item.name.toLowerCase().includes(search.toLowerCase()) ||
      row.warehouse.code.toLowerCase().includes(search.toLowerCase()),
  );

  const totals = balances.reduce(
    (acc, row) => {
      acc.onHand += Number(row.onHand);
      acc.reserved += Number(row.reserved);
      acc.blocked += Number(row.blocked);
      acc.available += Number(row.available);
      return acc;
    },
    { onHand: 0, reserved: 0, blocked: 0, available: 0 },
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventori"
        title="Saldo stok"
        description="Stok tersedia, dipesan dan diblokir menurut barang dan gudang."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}

      <StatGrid>
        <Stat label="Baris stok" value={balances.length} />
        <Stat label="Tersedia" hint="unit" value={formatQuantity(totals.onHand)} />
        <Stat label="Dipesan" hint="unit" value={formatQuantity(totals.reserved)} />
        <Stat label="Diblokir" hint="unit" tone="warning" value={formatQuantity(totals.blocked)} />
        <Stat label="Tersisa" hint="tersedia − dipesan − diblokir" tone="success" value={formatQuantity(totals.available)} />
      </StatGrid>

      <Card>
        <CardHeader
          description={`${balances.length} baris stok${balances.length === 1 ? "" : "s"} di seluruh gudang.`}
          title="Saldo Stok"
        />
        <div className="flex items-end gap-2 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari barang, SKU atau gudang…" />
        </div>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Memuat…</div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Tidak ada stok yang cocok dengan pencarian" />
          ) : (
            <Table>
              <TableHead>
                <Tr>
                  <Th>SKU</Th>
                  <Th>Barang</Th>
                  <Th>Gudang</Th>
                  <Th align="right">Tersedia</Th>
                  <Th align="right">Dipesan</Th>
                  <Th align="right">Diblokir</Th>
                  <Th align="right">Tersisa</Th>
                  <Th align="right">Biaya rata-rata</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {filtered.map((row) => (
                  <Tr key={row.id}>
                    <Td className="font-medium tnum">{row.item.sku}</Td>
                    <Td className="text-slate-600">{row.item.name}</Td>
                    <Td className="text-slate-600 tnum">{row.warehouse.code}</Td>
                    <Td align="right" className="tnum text-slate-600">{formatQuantity(row.onHand)}</Td>
                    <Td align="right" className="tnum text-slate-600">{formatQuantity(row.reserved)}</Td>
                    <Td align="right" className="tnum text-slate-600">{formatQuantity(row.blocked)}</Td>
                    <Td align="right" className={`tnum font-medium ${Number(row.available) <= 0 ? "text-red-600" : "text-slate-600"}`}>
                      {formatQuantity(row.available)}
                    </Td>
                    <Td align="right" className="tnum text-slate-600">
                      {row.averageUnitCost ? formatMoney(row.averageUnitCost) : "—"}
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
