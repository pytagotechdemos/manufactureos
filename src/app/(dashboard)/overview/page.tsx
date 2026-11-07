import type { Metadata } from "next";
import { requireCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Ringkasan",
};

export default async function OverviewPage() {
  const user = await requireCurrentUser();

  const [itemsCount, openPurchaseOrders, openWorkOrders, pendingInspections] = await Promise.all([
    prisma.item.count({ where: { status: "ACTIVE" } }),
    prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED"] } } }),
    prisma.manufacturingOrder.count({ where: { status: { in: ["RELEASED", "IN_PROGRESS", "QC_PENDING"] } } }),
    prisma.qcInspection.count({ where: { status: "DRAFT" } }),
  ]);

  const recentItems = await prisma.item.findMany({
    take: 6,
    orderBy: { createdAt: "desc" },
    select: { id: true, sku: true, name: true, itemType: true, status: true, baseUom: { select: { code: true } } },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi"
        title="Ringkasan"
        description={`Selamat datang kembali, ${user.name}. Berikut kondisi pabrik saat ini.`}
      />

      <StatGrid>
        <Stat label="Barang aktif" hint="Data master barang" value={itemsCount} />
        <Stat label="Pembelian terbuka" hint="Draf, disetujui atau sebagian diterima" value={openPurchaseOrders} />
        <Stat label="Produksi terbuka" hint="Dirilis, diproses atau antre kualitas" value={openWorkOrders} tone="warning" />
        <Stat label="Pemeriksaan menunggu" hint="Antrian kontrol kualitas" value={pendingInspections} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader
            description="Data master barang yang baru ditambahkan."
            title="Data Master Barang"
          />
          <div className="flex items-end gap-2 p-4">
            <Button variant="primary" size="sm">Buat barang</Button>
          </div>
          <CardBody className="p-0">
            <Table>
              <TableHead>
                <Tr>
                  <Th>SKU</Th>
                  <Th>Nama</Th>
                  <Th>Tipe</Th>
                  <Th align="right">UOM Dasar</Th>
                  <Th>Status</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {recentItems.length === 0 ? (
                  <Tr>
                    <Td colSpan={5}>
                      <EmptyState compact title="Belum ada barang" description="Buat barang pertama Anda dari Data Master Barang." />
                    </Td>
                  </Tr>
                ) : (
                  recentItems.map((item) => (
                    <Tr key={item.id}>
                      <Td className="font-medium">{item.sku}</Td>
                      <Td className="text-slate-600">{item.name}</Td>
                      <Td className="text-slate-600">{item.itemType.replace(/_/g, " ")}</Td>
                      <Td align="right" className="tnum text-slate-600">
                        {item.baseUom?.code ?? "—"}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 border-emerald-200 bg-emerald-50 text-emerald-700">
                          <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                          Aktif
                        </span>
                      </Td>
                    </Tr>
                  ))
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
