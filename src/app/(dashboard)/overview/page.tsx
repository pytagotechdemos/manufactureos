import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { formatQuantity } from "@/lib/format";

export const metadata: Metadata = {
  title: "Ringkasan",
};

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "Bahan baku",
  PURCHASED_COMPONENT: "Komponen beli",
  SUB_ASSEMBLY: "Sub-assembly",
  FINISHED_GOODS: "Barang jadi",
  CONSUMABLE: "Konsumsi",
};

export default async function OverviewPage() {
  const user = await requireCurrentUser();

  const [itemsCount, openPurchaseOrders, openPurchaseRequests, openWorkOrders, pendingInspections, recentItems, recentOrders] =
    await Promise.all([
      prisma.item.count({ where: { status: "ACTIVE" } }),
      prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED"] } } }),
      prisma.purchaseRequest.count({ where: { status: "DRAFT" } }),
      prisma.manufacturingOrder.count({ where: { status: { in: ["RELEASED", "IN_PROGRESS", "QC_PENDING"] } } }),
      prisma.qcInspection.count({ where: { status: "DRAFT" } }),
      prisma.item.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, sku: true, name: true, itemType: true, status: true, baseUom: { select: { code: true } } },
      }),
      prisma.manufacturingOrder.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          quantity: true,
          createdAt: true,
          item: { select: { sku: true, name: true } },
        },
      }),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi"
        title="Ringkasan Operasional"
        description={`Selamat datang kembali, ${user.name}. Pantau status terkini lantai produksi dan rantai pasok.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/planning"
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Perencanaan MRP
            </Link>
            <Link
              href="/manufacturing"
              className="inline-flex h-9 items-center justify-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-brand-700"
            >
              Produksi
            </Link>
          </div>
        }
      />

      <StatGrid>
        <Stat
          href="/items"
          label="Barang aktif"
          hint="Data master barang terdaftar →"
          value={itemsCount}
        />
        <Stat
          href="/procurement"
          label="Pembelian terbuka"
          hint={openPurchaseRequests > 0 ? `${openPurchaseOrders} PO · ${openPurchaseRequests} PR draf →` : "Draf, disetujui, atau parsial →"}
          value={openPurchaseOrders}
        />
        <Stat
          href="/manufacturing"
          label="Produksi terbuka"
          hint="Dirilis, diproses, atau antre QC →"
          value={openWorkOrders}
          tone="warning"
        />
        <Stat
          href="/quality"
          label="Pemeriksaan draf"
          hint="Antrean kontrol kualitas →"
          value={pendingInspections}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Pesanan Produksi Terkini"
            description="5 pesanan produksi terakhir yang dibuat di sistem."
            actions={
              <Link
                href="/manufacturing"
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Lihat semua &rarr;
              </Link>
            }
          />
          <CardBody className="p-0">
            <Table>
              <TableHead>
                <Tr>
                  <Th>Nomor</Th>
                  <Th>Barang</Th>
                  <Th align="right">Target</Th>
                  <Th>Status</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <Tr>
                    <Td colSpan={4}>
                      <EmptyState compact title="Belum ada pesanan produksi" description="Buat pesanan produksi melalui modul Perencanaan atau Produksi." />
                    </Td>
                  </Tr>
                ) : (
                  recentOrders.map((order) => (
                    <Tr key={order.id}>
                      <Td className="font-medium tnum">
                        <Link
                          href={`/manufacturing?mo=${encodeURIComponent(order.number)}`}
                          className="font-semibold text-brand-600 hover:underline"
                        >
                          {order.number}
                        </Link>
                      </Td>
                      <Td className="text-slate-600 text-xs">
                        <span className="font-medium tnum text-slate-800">{order.item.sku}</span> · {order.item.name}
                      </Td>
                      <Td align="right" className="tnum text-slate-700 font-medium">
                        {formatQuantity(order.quantity.toString())}
                      </Td>
                      <Td><StatusBadge status={order.status} /></Td>
                    </Tr>
                  ))
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Data Master Barang"
            description="Barang dan komponen yang baru ditambahkan."
            actions={
              <Link
                href="/items"
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Kelola barang &rarr;
              </Link>
            }
          />
          <CardBody className="p-0">
            <Table>
              <TableHead>
                <Tr>
                  <Th>SKU</Th>
                  <Th>Nama</Th>
                  <Th>Tipe</Th>
                  <Th align="right">UOM</Th>
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
                      <Td className="font-medium tnum">
                        <Link
                          href={`/items?sku=${encodeURIComponent(item.sku)}`}
                          className="font-semibold text-brand-600 hover:underline"
                        >
                          {item.sku}
                        </Link>
                      </Td>
                      <Td className="text-slate-600 text-xs">{item.name}</Td>
                      <Td className="text-slate-500 text-xs">{itemTypeLabels[item.itemType] ?? item.itemType.replace(/_/g, " ")}</Td>
                      <Td align="right" className="tnum text-slate-600 text-xs">
                        {item.baseUom?.code ?? "—"}
                      </Td>
                      <Td><StatusBadge status={item.status} /></Td>
                    </Tr>
                  ))
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Alur Operasi Discrete Manufacturing"
          description="Panduan alur operasional ERP dari perancangan hingga pelaporan keuangan."
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/engineering"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">1. Teknik</p>
              <h4 className="mt-1 font-semibold text-slate-900">Struktur BOM</h4>
              <p className="mt-1 text-xs text-slate-500">Definisikan formula barang jadi, sub-assembly, dan komponen bahan baku.</p>
            </Link>

            <Link
              href="/planning"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">2. Perencanaan</p>
              <h4 className="mt-1 font-semibold text-slate-900">Kalkulasi MRP</h4>
              <p className="mt-1 text-xs text-slate-500">Hitung kebutuhan bersih bahan dan jadwalkan rilis pesanan tepat waktu.</p>
            </Link>

            <Link
              href="/procurement"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">3. Rantai Pasok</p>
              <h4 className="mt-1 font-semibold text-slate-900">Pembelian & GRN</h4>
              <p className="mt-1 text-xs text-slate-500">Terbitkan PO ke supplier dan terima barang masuk ke gudang utama.</p>
            </Link>

            <Link
              href="/manufacturing"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">4. Produksi</p>
              <h4 className="mt-1 font-semibold text-slate-900">Perintah Produksi</h4>
              <p className="mt-1 text-xs text-slate-500">Terbitkan bahan ke WIP, jalankan pesanan kerja, dan pantau operasi.</p>
            </Link>

            <Link
              href="/quality"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">5. Kualitas</p>
              <h4 className="mt-1 font-semibold text-slate-900">Inspeksi QC</h4>
              <p className="mt-1 text-xs text-slate-500">Periksa output fisik dan tentukan jumlah diterima, ditolak, atau rework.</p>
            </Link>

            <Link
              href="/manufacturing/receipts"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">6. Gudang Jadi</p>
              <h4 className="mt-1 font-semibold text-slate-900">Terima Produksi</h4>
              <p className="mt-1 text-xs text-slate-500">Posting barang jadi hasil QC ke stok gudang barang jadi.</p>
            </Link>

            <Link
              href="/inventory"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">7. Inventori</p>
              <h4 className="mt-1 font-semibold text-slate-900">Saldo & Ledger</h4>
              <p className="mt-1 text-xs text-slate-500">Pantau pergerakan stok, penyesuaian saldo, dan karantina stok diblokir.</p>
            </Link>

            <Link
              href="/reports"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">8. Biaya</p>
              <h4 className="mt-1 font-semibold text-slate-900">Laporan & Variansi</h4>
              <p className="mt-1 text-xs text-slate-500">Bandingkan biaya estimasi vs aktual serta valuasi nilai persediaan bergerak.</p>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
