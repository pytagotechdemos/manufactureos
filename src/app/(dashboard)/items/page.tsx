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
  const [search, setSearch] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/items?limit=100`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Failed to load items");
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const filtered = items.filter(
    (item) =>
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleCreateItem() {
    setNotice("Item creation form is not implemented yet — seed data already covers the demo scenario. Use the database seed or add items through an API client.");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Master data"
        title="Item Master"
        description="Raw materials, purchased components, sub-assemblies and finished goods."
        actions={
          <Button onClick={handleCreateItem} variant="primary">
            Create item
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="info" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Card>
        <CardHeader
          actions={
            <div className="flex items-end gap-2 p-4">
              <SearchInput placeholder="Search items…" />
            </div>
          }
          description={`${items.length} active item${items.length === 1 ? "" : "s"} in the master data.`}
          title="Item Master"
        />
        <CardBody className="p-0">
          <Table>
            <TableHead>
              <Tr>
                <Th>SKU</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th align="right">Base UOM</Th>
                <Th>Status</Th>
                <Th align="right">Added</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {loading ? (
                <Tr>
                  <Td colSpan={6}>
                    <div className="flex h-16 items-center justify-center gap-2 text-[13px] text-slate-500">
                      Loading…
                    </div>
                  </Td>
                </Tr>
              ) : filtered.length === 0 ? (
                <Tr>
                  <Td colSpan={6}>
                    <EmptyState compact title="No items match your search" />
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
