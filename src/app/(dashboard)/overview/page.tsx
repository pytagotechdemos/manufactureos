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
        eyebrow="Dashboard"
        title="Ringkasan Operasional"
        description={`Selamat datang kembali, ${user.name}. Pantau status terkini produksi, inventory, dan supply chain.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/planning"
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Kalkulasi MRP
            </Link>
            <Link
              href="/manufacturing"
              className="inline-flex h-9 items-center justify-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-brand-700"
            >
              Manufacturing Orders
            </Link>
          </div>
        }
      />

      <StatGrid>
        <Stat
          href="/items"
          label="Item Master Aktif"
          hint="Data master barang & material →"
          value={itemsCount}
        />
        <Stat
          href="/procurement"
          label="Purchase Orders Aktif"
          hint={openPurchaseRequests > 0 ? `${openPurchaseOrders} PO aktif · ${openPurchaseRequests} PR diajukan →` : "PO aktif & parsial →"}
          value={openPurchaseOrders}
        />
        <Stat
          href="/manufacturing"
          label="Manufacturing Orders"
          hint="Dirilis, diproses, atau antre QC →"
          value={openWorkOrders}
          tone="warning"
        />
        <Stat
          href="/quality"
          label="Pending Inspeksi QC"
          hint="Menunggu pemeriksaan mutu →"
          value={pendingInspections}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Manufacturing Orders Terkini"
            description="5 Manufacturing Orders (MO) terakhir yang dibuat di sistem."
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
                  <Th className="w-[140px]">Nomor MO</Th>
                  <Th>Item / Produk</Th>
                  <Th align="right" className="w-[80px]">Target Qty</Th>
                  <Th className="w-[120px]">Status</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <Tr>
                    <Td colSpan={4}>
                      <EmptyState compact title="Belum ada Manufacturing Order" description="Buat pesanan produksi melalui modul Perencanaan atau Produksi." />
                    </Td>
                  </Tr>
                ) : (
                  recentOrders.map((order) => (
                    <Tr key={order.id}>
                      <Td className="font-semibold text-brand-600 font-mono text-xs whitespace-nowrap">
                        <Link
                          href={`/manufacturing?mo=${encodeURIComponent(order.number)}`}
                          className="hover:underline"
                        >
                          {order.number}
                        </Link>
                      </Td>
                      <Td className="text-slate-800 text-xs">
                        <div className="font-semibold">{order.item.sku}</div>
                        <div className="text-slate-500 truncate max-w-[200px]">{order.item.name}</div>
                      </Td>
                      <Td align="right" className="tnum text-slate-900 font-medium text-xs whitespace-nowrap">
                        {formatQuantity(order.quantity.toString())}
                      </Td>
                      <Td className="whitespace-nowrap"><StatusBadge status={order.status} /></Td>
                    </Tr>
                  ))
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Item Master Terbaru"
            description="Barang dan komponen yang baru ditambahkan."
            actions={
              <Link
                href="/items"
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Kelola item &rarr;
              </Link>
            }
          />
          <CardBody className="p-0">
            <Table>
              <TableHead>
                <Tr>
                  <Th className="w-[120px]">SKU</Th>
                  <Th>Nama Item</Th>
                  <Th className="w-[110px]">Tipe</Th>
                  <Th align="right" className="w-[70px]">UOM</Th>
                  <Th className="w-[90px]">Status</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {recentItems.length === 0 ? (
                  <Tr>
                    <Td colSpan={5}>
                      <EmptyState compact title="Belum ada data barang" description="Tambahkan barang dari menu Item Master." />
                    </Td>
                  </Tr>
                ) : (
                  recentItems.map((item) => (
                    <Tr key={item.id}>
                      <Td className="font-semibold text-brand-600 font-mono text-xs whitespace-nowrap">
                        <Link
                          href={`/items?sku=${encodeURIComponent(item.sku)}`}
                          className="hover:underline"
                        >
                          {item.sku}
                        </Link>
                      </Td>
                      <Td className="text-slate-800 text-xs font-medium truncate max-w-[150px]">{item.name}</Td>
                      <Td className="text-slate-600 text-xs whitespace-nowrap">{itemTypeLabels[item.itemType] ?? item.itemType.replace(/_/g, " ")}</Td>
                      <Td align="right" className="font-mono text-slate-600 text-xs whitespace-nowrap">
                        {item.baseUom?.code ?? "—"}
                      </Td>
                      <Td className="whitespace-nowrap"><StatusBadge status={item.status} /></Td>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">1. Engineering</p>
              <h4 className="mt-1 font-semibold text-slate-900">Bill of Materials (BOM)</h4>
              <p className="mt-1 text-xs text-slate-500">Definisikan formula barang jadi, sub-assembly, dan komponen bahan baku.</p>
            </Link>

            <Link
              href="/planning"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">2. MRP Planning</p>
              <h4 className="mt-1 font-semibold text-slate-900">Kalkulasi MRP & Demand</h4>
              <p className="mt-1 text-xs text-slate-500">Hitung kebutuhan bersih bahan dan jadwalkan rilis pesanan tepat waktu.</p>
            </Link>

            <Link
              href="/procurement"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">3. Supply Chain</p>
              <h4 className="mt-1 font-semibold text-slate-900">Procurement & GRN</h4>
              <p className="mt-1 text-xs text-slate-500">Terbitkan PO ke supplier dan terima barang masuk (GRN) ke gudang utama.</p>
            </Link>

            <Link
              href="/manufacturing"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">4. Manufacturing</p>
              <h4 className="mt-1 font-semibold text-slate-900">Manufacturing Orders</h4>
              <p className="mt-1 text-xs text-slate-500">Terbitkan bahan ke WIP, eksekusi Work Order, dan pantau jalannya operasi.</p>
            </Link>

            <Link
              href="/quality"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">5. Quality Control</p>
              <h4 className="mt-1 font-semibold text-slate-900">Inspeksi QC</h4>
              <p className="mt-1 text-xs text-slate-500">Periksa output fisik dan tentukan jumlah diterima, ditolak, atau rework.</p>
            </Link>

            <Link
              href="/manufacturing/receipts"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">6. Production Receipts</p>
              <h4 className="mt-1 font-semibold text-slate-900">Penerimaan Produksi</h4>
              <p className="mt-1 text-xs text-slate-500">Posting barang jadi hasil QC ke stok gudang barang jadi.</p>
            </Link>

            <Link
              href="/inventory"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">7. Inventory</p>
              <h4 className="mt-1 font-semibold text-slate-900">Stock Balances & Ledger</h4>
              <p className="mt-1 text-xs text-slate-500">Pantau pergerakan stok, penyesuaian saldo, dan karantina stok diblokir.</p>
            </Link>

            <Link
              href="/reports"
              className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-brand-500 hover:shadow-xs"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-brand-600">8. Costing & Finance</p>
              <h4 className="mt-1 font-semibold text-slate-900">Costing & Analisis Variansi</h4>
              <p className="mt-1 text-xs text-slate-500">Bandingkan biaya estimasi vs aktual serta valuasi nilai persediaan bergerak.</p>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
