"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

interface ItemRow {
  id: string;
  sku: string;
  name: string;
  itemType: string;
  status: string;
  baseUom: { code: string } | null;
  createdAt: string;
}

export default function ItemsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/items?limit=100`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Gagal memuat barang");
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat barang");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const filtered = items;

  async function handleCreateItem() {
    setNotice("Form pembuatan barang belum diimplementasikan — data contoh seed sudah mencakup skenario demo. Gunakan database seed atau tambahkan barang melalui klien API.");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data master"
        title="Data Master Barang"
        description="Bahan baku, komponen pembelian, sub-assembly dan barang jadi."
        actions={
          <Button onClick={handleCreateItem} variant="primary">
            Buat barang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="info" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Card>
        <CardHeader
          actions={
            <div className="flex items-end gap-2 p-4">
              <SearchInput placeholder="Cari barang…" />
            </div>
          }
          description={`${items.length} barang aktif${items.length === 1 ? "" : "s"} dalam data master.`}
          title="Data Master Barang"
        />
        <CardBody className="p-0">
          <Table>
            <TableHead>
              <Tr>
                <Th>SKU</Th>
                <Th>Nama</Th>
                <Th>Tipe</Th>
                <Th align="right">UOM Dasar</Th>
                <Th>Status</Th>
                <Th align="right">Ditambahkan</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {loading ? (
                <Tr>
                  <Td colSpan={6}>
                    <div className="flex h-16 items-center justify-center gap-2 text-[13px] text-slate-500">
                      Memuat…
                    </div>
                  </Td>
                </Tr>
              ) : filtered.length === 0 ? (
                <Tr>
                  <Td colSpan={6}>
                    <EmptyState compact title="Tidak ada barang yang cocok dengan pencarian" />
                  </Td>
                </Tr>
              ) : (
                filtered.map((item) => (
                  <Tr key={item.id}>
                    <Td className="font-medium tnum">{item.sku}</Td>
                    <Td className="text-slate-600">{item.name}</Td>
                    <Td className="text-slate-600">{item.itemType.replace(/_/g, " ")}</Td>
                    <Td align="right" className="tnum text-slate-600">
                      {item.baseUom?.code ?? "—"}
                    </Td>
                    <Td>{<StatusBadge status={item.status} />}</Td>
                    <Td align="right" className="tnum text-slate-500">
                      {formatDate(item.createdAt)}
                    </Td>
                  </Tr>
                ))
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
