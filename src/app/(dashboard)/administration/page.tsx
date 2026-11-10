import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-session";
import { userHasPermission } from "@/lib/authorize";
import { formatDate, formatDateTime, formatMoney, formatRelative, todayJakarta, truncateId } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs";
import { ExportCsvButton } from "@/components/admin/export-csv-button";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { UserStatusButton } from "@/components/admin/user-status-button";
import { CreateCategoryModal } from "@/components/admin/create-category-modal";
import { CategoryStatusButton } from "@/components/admin/category-status-button";
import { CreateSupplierModal } from "@/components/admin/create-supplier-modal";
import { SupplierStatusButton } from "@/components/admin/supplier-status-button";
import { CreateWarehouseModal } from "@/components/admin/create-warehouse-modal";
import { WarehouseStatusButton } from "@/components/admin/warehouse-status-button";
import { CreateUomModal } from "@/components/admin/create-uom-modal";
import { UomStatusButton } from "@/components/admin/uom-status-button";
import { CreateWorkCenterModal } from "@/components/admin/create-work-center-modal";
import { WorkCenterStatusButton } from "@/components/admin/work-center-status-button";
import {
  ArrowLeftRight,
  Building2,
  Factory,
  FolderTree,
  History,
  Ruler,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Administrasi",
};

export default async function AdministrationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const allowed = await userHasPermission(user.id, "users.manage");
  if (!allowed) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Akses Dibatasi" title="Administrasi Sistem" />
        <Card>
          <CardBody className="p-8 text-center text-slate-500">
            Akun Anda tidak memiliki izin users.manage. Hubungi administrator sistem.
          </CardBody>
        </Card>
      </div>
    );
  }

  const [
    users,
    roles,
    permissionCount,
    categories,
    suppliers,
    warehouses,
    uoms,
    uomConversions,
    workCenters,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        userRoles: { select: { role: { select: { code: true, name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.permission.count(),
    prisma.itemCategory.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
    prisma.supplier.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        status: true,
        createdAt: true,
        _count: { select: { purchaseOrders: true, requests: true } },
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
    prisma.warehouse.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isWip: true,
        status: true,
        createdAt: true,
        _count: { select: { balances: true, movements: true } },
      },
      orderBy: [{ status: "asc" }, { isWip: "asc" }, { code: "asc" }],
    }),
    prisma.unitOfMeasure.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        dimension: true,
        precision: true,
        status: true,
        createdAt: true,
        _count: { select: { baseItems: true, conversionsFrom: true } },
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
    prisma.uomConversion.findMany({
      select: {
        id: true,
        factor: true,
        fromUom: { select: { code: true, name: true } },
        toUom: { select: { code: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workCenter.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        hourlyRate: true,
        standardMinutes: true,
        status: true,
        createdAt: true,
        _count: { select: { workOrders: true } },
      },
      orderBy: [{ status: "asc" }, { code: "asc" }],
    }),
    prisma.auditLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        source: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);

  const activeUsers = users.filter((entry) => entry.status === "ACTIVE").length;
  const activeCategories = categories.filter((entry) => entry.status === "ACTIVE").length;
  const activeSuppliers = suppliers.filter((entry) => entry.status === "ACTIVE").length;
  const activeWarehouses = warehouses.filter((entry) => entry.status === "ACTIVE").length;
  const activeUoms = uoms.filter((entry) => entry.status === "ACTIVE").length;
  const activeWorkCenters = workCenters.filter((entry) => entry.status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Konfigurasi & Master Data"
        title="Administrasi"
        description="Kelola pengguna, master kategori, satuan (UOM), work center, gudang, pemasok, dan periksa jejak audit sistem."
      />

      <StatGrid>
        <Stat label="Pengguna" hint={`${activeUsers} aktif`} value={users.length} />
        <Stat label="Kategori" hint={`${activeCategories} aktif`} value={categories.length} />
        <Stat label="Satuan (UOM)" hint={`${activeUoms} aktif`} value={uoms.length} />
        <Stat label="Work Center" hint={`${activeWorkCenters} aktif`} value={workCenters.length} />
        <Stat label="Gudang" hint={`${activeWarehouses} aktif`} value={warehouses.length} />
        <Stat label="Pemasok" hint={`${activeSuppliers} aktif`} value={suppliers.length} />
      </StatGrid>

      <Tabs defaultValue="users">
        <TabList label="Kategori Administrasi">
          <Tab count={users.length} value="users">
            <span className="flex items-center gap-1.5">
              <Users aria-hidden className="size-4" />
              Pengguna & Peran
            </span>
          </Tab>
          <Tab count={categories.length} value="categories">
            <span className="flex items-center gap-1.5">
              <FolderTree aria-hidden className="size-4" />
              Kategori Barang
            </span>
          </Tab>
          <Tab count={uoms.length} value="uoms">
            <span className="flex items-center gap-1.5">
              <Ruler aria-hidden className="size-4" />
              Satuan Ukuran
            </span>
          </Tab>
          <Tab count={workCenters.length} value="workCenters">
            <span className="flex items-center gap-1.5">
              <Factory aria-hidden className="size-4" />
              Pusat Kerja (Work Center)
            </span>
          </Tab>
          <Tab count={warehouses.length} value="warehouses">
            <span className="flex items-center gap-1.5">
              <Warehouse aria-hidden className="size-4" />
              Gudang
            </span>
          </Tab>
          <Tab count={suppliers.length} value="suppliers">
            <span className="flex items-center gap-1.5">
              <Building2 aria-hidden className="size-4" />
              Pemasok
            </span>
          </Tab>
          <Tab count={recentAuditLogs.length} value="audit">
            <span className="flex items-center gap-1.5">
              <History aria-hidden className="size-4" />
              Log Audit
            </span>
          </Tab>
        </TabList>

        {/* Tab 1: Pengguna & Peran */}
        <TabPanel value="users">
          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                actions={
                  <div className="flex items-center gap-2">
                    <ExportCsvButton
                      filename={`daftar-pengguna-${todayJakarta()}.csv`}
                      headers={["Nama", "Email", "Peran", "Status", "Tanggal Dibuat"]}
                      rows={users.map((u) => [
                        u.name,
                        u.email,
                        u.userRoles.map((entry) => entry.role.name).join("; "),
                        u.status,
                        formatDate(u.createdAt),
                      ])}
                    />
                    <CreateUserForm />
                  </div>
                }
                description="Akun dibuat di sini; pendaftaran publik tetap dinonaktifkan."
                title="Daftar Pengguna"
              />
              <CardBody className="p-0">
                {users.length === 0 ? (
                  <EmptyState icon={<Users aria-hidden className="size-5" />} title="Belum ada akun" />
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Nama</Th>
                        <Th>Email</Th>
                        <Th>Peran</Th>
                        <Th>Status</Th>
                        <Th>Dibuat</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {users.map((u) => (
                        <Tr key={u.id}>
                          <Td className="font-medium text-slate-900">{u.name}</Td>
                          <Td className="text-slate-600">{u.email}</Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              {u.userRoles.length === 0 ? (
                                <span className="text-xs text-slate-400">—</span>
                              ) : (
                                u.userRoles.map((entry) => (
                                  <Badge key={entry.role.code} tone="neutral">
                                    {entry.role.name}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </Td>
                          <Td>
                            <StatusBadge status={u.status} />
                          </Td>
                          <Td className="text-slate-500">{formatDate(u.createdAt)}</Td>
                          <Td align="right">
                            <UserStatusButton currentStatus={u.status} isSelf={u.id === user.id} userId={u.id} />
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                description={`Total ${permissionCount} izin granular dalam kontrol akses berbasis peran (RBAC).`}
                title="Peran & Izin"
              />
              <CardBody className="space-y-4">
                {roles.map((role) => (
                  <div key={role.id} className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck aria-hidden className="size-4 text-brand-600" />
                        <span className="font-medium text-slate-900">{role.name}</span>
                      </div>
                      <span className="font-mono text-xs text-slate-500">{role.code}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {role.permissions.length} izin diberikan:{" "}
                      <span className="font-mono text-slate-700">
                        {role.permissions.map((p) => p.permission.code).join(", ")}
                      </span>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 2: Kategori Barang */}
        <TabPanel value="categories">
          <div className="mt-5">
            <Card>
              <CardHeader
                actions={
                  <div className="flex items-center gap-2">
                    <ExportCsvButton
                      filename={`kategori-barang-${todayJakarta()}.csv`}
                      headers={["Kode", "Nama", "Total Barang", "Status", "Tanggal Dibuat"]}
                      rows={categories.map((c) => [
                        c.code,
                        c.name,
                        c._count.items,
                        c.status,
                        formatDate(c.createdAt),
                      ])}
                    />
                    <CreateCategoryModal />
                  </div>
                }
                description="Klasifikasi dan taksonomi master barang untuk filtering inventaris, BOM, dan pelaporan."
                title="Daftar Kategori Barang (Item Categories)"
              />
              <CardBody className="p-0">
                {categories.length === 0 ? (
                  <EmptyState icon={<FolderTree aria-hidden className="size-5" />} title="Belum ada kategori barang" />
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Kode Kategori</Th>
                        <Th>Nama Kategori</Th>
                        <Th align="right">Total Barang Terkait</Th>
                        <Th>Status</Th>
                        <Th>Dibuat</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {categories.map((c) => (
                        <Tr key={c.id}>
                          <Td className="font-mono text-[13px] font-bold text-brand-700">{c.code}</Td>
                          <Td className="font-medium text-slate-900">{c.name}</Td>
                          <Td align="right" className="tnum font-medium text-slate-700">
                            {c._count.items} barang
                          </Td>
                          <Td>
                            <StatusBadge status={c.status} />
                          </Td>
                          <Td className="text-slate-500">{formatDate(c.createdAt)}</Td>
                          <Td align="right">
                            <CategoryStatusButton categoryId={c.id} currentStatus={c.status} />
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 3: Satuan Ukuran (UOM) & Konversi */}
        <TabPanel value="uoms">
          <div className="mt-5 space-y-6">
            <Card>
              <CardHeader
                actions={
                  <div className="flex items-center gap-2">
                    <ExportCsvButton
                      filename={`satuan-uom-${todayJakarta()}.csv`}
                      headers={["Kode", "Nama", "Dimensi", "Presisi Desimal", "Status"]}
                      rows={uoms.map((u) => [
                        u.code,
                        u.name,
                        u.dimension,
                        u.precision,
                        u.status,
                      ])}
                    />
                    <CreateUomModal />
                  </div>
                }
                description="Satuan unit untuk item, BOM, pembelian, dan persediaan dengan presisi desimal."
                title="Daftar Satuan Ukuran (Units of Measure)"
              />
              <CardBody className="p-0">
                {uoms.length === 0 ? (
                  <EmptyState icon={<Ruler aria-hidden className="size-5" />} title="Belum ada data satuan" />
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Simbol / Kode</Th>
                        <Th>Nama Satuan</Th>
                        <Th>Dimensi Fisik</Th>
                        <Th align="right">Presisi Desimal</Th>
                        <Th align="right">Digunakan Pada</Th>
                        <Th>Status</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {uoms.map((u) => (
                        <Tr key={u.id}>
                          <Td className="font-mono text-[13px] font-bold text-brand-700">{u.code}</Td>
                          <Td className="font-medium text-slate-900">{u.name}</Td>
                          <Td>
                            <Badge tone="info">{u.dimension}</Badge>
                          </Td>
                          <Td align="right" className="tnum text-slate-700 font-mono">
                            {u.precision} angka desimal
                          </Td>
                          <Td align="right" className="tnum text-slate-700">
                            <span className="font-medium">{u._count.baseItems}</span> barang /{" "}
                            <span className="text-slate-500">{u._count.conversionsFrom} konversi</span>
                          </Td>
                          <Td>
                            <StatusBadge status={u.status} />
                          </Td>
                          <Td align="right">
                            <UomStatusButton currentStatus={u.status} uomId={u.id} />
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                description="Faktor pengali rasio konversi antara dua satuan dengan dimensi fisik yang sama (misal: 1 DZN = 12 PCS)."
                title="Tabel Konversi Satuan Antar-UOM"
              />
              <CardBody className="p-0">
                {uomConversions.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    Belum ada aturan konversi satuan khusus. Konversi dapat ditambahkan dari modul Master Barang.
                  </div>
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Satuan Asal (From)</Th>
                        <Th className="text-center">Arah Hubungan</Th>
                        <Th>Satuan Tujuan (To)</Th>
                        <Th align="right">Faktor Rasio (1 Asal = X Tujuan)</Th>
                        <Th>Didaftarkan</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {uomConversions.map((conv) => (
                        <Tr key={conv.id}>
                          <Td className="font-mono font-semibold text-slate-900">
                            {conv.fromUom.code} <span className="font-normal text-slate-500">({conv.fromUom.name})</span>
                          </Td>
                          <Td align="center">
                            <ArrowLeftRight aria-hidden className="size-4 text-brand-600 inline-block" />
                          </Td>
                          <Td className="font-mono font-semibold text-slate-900">
                            {conv.toUom.code} <span className="font-normal text-slate-500">({conv.toUom.name})</span>
                          </Td>
                          <Td align="right" className="tnum font-mono font-bold text-brand-700">
                            {conv.factor.toString()}
                          </Td>
                          <Td className="text-slate-500">{formatDate(conv.createdAt)}</Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 4: Pusat Kerja (Work Center) */}
        <TabPanel value="workCenters">
          <div className="mt-5">
            <Card>
              <CardHeader
                actions={
                  <div className="flex items-center gap-2">
                    <ExportCsvButton
                      filename={`work-center-${todayJakarta()}.csv`}
                      headers={["Kode Stasiun", "Nama Work Center", "Tarif / Jam (IDR)", "Menit Standar", "Total WO Ditugaskan", "Status"]}
                      rows={workCenters.map((wc) => [
                        wc.code,
                        wc.name,
                        wc.hourlyRate.toString(),
                        wc.standardMinutes.toString(),
                        wc._count.workOrders,
                        wc.status,
                      ])}
                    />
                    <CreateWorkCenterModal />
                  </div>
                }
                description="Stasiun kerja atau mesin produksi untuk penjadwalan perintah kerja (WO) dan perhitungan biaya konversi."
                title="Daftar Pusat Kerja Produksi (Work Centers)"
              />
              <CardBody className="p-0">
                {workCenters.length === 0 ? (
                  <EmptyState icon={<Factory aria-hidden className="size-5" />} title="Belum ada work center" />
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Kode Stasiun</Th>
                        <Th>Nama Work Center</Th>
                        <Th align="right">Tarif / Jam (IDR)</Th>
                        <Th align="right">Menit Standar</Th>
                        <Th align="right">Total WO Ditugaskan</Th>
                        <Th>Status</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {workCenters.map((wc) => (
                        <Tr key={wc.id}>
                          <Td className="font-mono text-[13px] font-bold text-brand-700">{wc.code}</Td>
                          <Td className="font-medium text-slate-900">{wc.name}</Td>
                          <Td align="right" className="tnum font-mono text-slate-700">
                            {formatMoney(wc.hourlyRate.toString())}
                          </Td>
                          <Td align="right" className="tnum text-slate-700 font-mono">
                            {wc.standardMinutes.toString()} mnt
                          </Td>
                          <Td align="right" className="tnum font-medium text-slate-700">
                            {wc._count.workOrders} perintah kerja
                          </Td>
                          <Td>
                            <StatusBadge status={wc.status} />
                          </Td>
                          <Td align="right">
                            <WorkCenterStatusButton currentStatus={wc.status} workCenterId={wc.id} />
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 5: Gudang */}
        <TabPanel value="warehouses">
          <div className="mt-5">
            <Card>
              <CardHeader
                actions={
                  <div className="flex items-center gap-2">
                    <ExportCsvButton
                      filename={`gudang-${todayJakarta()}.csv`}
                      headers={["Kode", "Nama Gudang", "Tipe Lokasi", "Deskripsi", "Total Saldo Stok", "Mutasi Tercatat", "Status"]}
                      rows={warehouses.map((w) => [
                        w.code,
                        w.name,
                        w.isWip ? "Lantai Produksi (WIP)" : "Gudang Penyimpanan",
                        w.description ?? "",
                        w._count.balances,
                        w._count.movements,
                        w.status,
                      ])}
                    />
                    <CreateWarehouseModal />
                  </div>
                }
                description="Lokasi penyimpanan bahan baku, komponen, barang jadi, dan lantai kerja (WIP)."
                title="Daftar Gudang & Lokasi"
              />
              <CardBody className="p-0">
                {warehouses.length === 0 ? (
                  <EmptyState icon={<Warehouse aria-hidden className="size-5" />} title="Belum ada gudang" />
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Kode</Th>
                        <Th>Nama Gudang</Th>
                        <Th>Tipe Lokasi</Th>
                        <Th>Deskripsi</Th>
                        <Th align="right">Total Saldo Stok</Th>
                        <Th align="right">Mutasi Tercatat</Th>
                        <Th>Status</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {warehouses.map((w) => (
                        <Tr key={w.id}>
                          <Td className="font-mono text-[13px] font-bold text-brand-700">{w.code}</Td>
                          <Td className="font-medium text-slate-900">{w.name}</Td>
                          <Td>
                            {w.isWip ? (
                              <Badge tone="warning">Lantai Produksi (WIP)</Badge>
                            ) : (
                              <Badge tone="neutral">Gudang Penyimpanan</Badge>
                            )}
                          </Td>
                          <Td className="text-slate-500 max-w-xs truncate">{w.description ?? "—"}</Td>
                          <Td align="right" className="tnum text-slate-700">
                            {w._count.balances} item
                          </Td>
                          <Td align="right" className="tnum text-slate-700">
                            {w._count.movements} transaksi
                          </Td>
                          <Td>
                            <StatusBadge status={w.status} />
                          </Td>
                          <Td align="right">
                            <WarehouseStatusButton currentStatus={w.status} warehouseId={w.id} />
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 6: Pemasok */}
        <TabPanel value="suppliers">
          <div className="mt-5">
            <Card>
              <CardHeader
                actions={
                  <div className="flex items-center gap-2">
                    <ExportCsvButton
                      filename={`pemasok-${todayJakarta()}.csv`}
                      headers={["Kode", "Nama Pemasok", "Email", "Telepon", "Alamat", "Total PO", "Status"]}
                      rows={suppliers.map((s) => [
                        s.code,
                        s.name,
                        s.email ?? "",
                        s.phone ?? "",
                        s.address ?? "",
                        s._count.purchaseOrders,
                        s.status,
                      ])}
                    />
                    <CreateSupplierModal />
                  </div>
                }
                description="Rekanan pemasok bahan baku dan komponen pembelian."
                title="Daftar Pemasok (Suppliers)"
              />
              <CardBody className="p-0">
                {suppliers.length === 0 ? (
                  <EmptyState icon={<Building2 aria-hidden className="size-5" />} title="Belum ada pemasok" />
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Kode</Th>
                        <Th>Nama Pemasok</Th>
                        <Th>Kontak</Th>
                        <Th>Alamat</Th>
                        <Th align="right">Pesanan Pembelian (PO)</Th>
                        <Th>Status</Th>
                        <Th align="right">Aksi</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {suppliers.map((s) => (
                        <Tr key={s.id}>
                          <Td className="font-mono text-[13px] font-bold text-brand-700">{s.code}</Td>
                          <Td className="font-medium text-slate-900">{s.name}</Td>
                          <Td className="text-slate-600">
                            <div>{s.email ?? "—"}</div>
                            <div className="text-xs text-slate-400">{s.phone ?? ""}</div>
                          </Td>
                          <Td className="text-slate-500 max-w-xs truncate">{s.address ?? "—"}</Td>
                          <Td align="right" className="tnum text-slate-700">
                            {s._count.purchaseOrders} PO / {s._count.requests} PR
                          </Td>
                          <Td>
                            <StatusBadge status={s.status} />
                          </Td>
                          <Td align="right">
                            <SupplierStatusButton currentStatus={s.status} supplierId={s.id} />
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        {/* Tab 7: Log Audit */}
        <TabPanel value="audit">
          <div className="mt-5">
            <Card>
              <CardHeader
                actions={
                  <ExportCsvButton
                    filename={`audit-trail-${todayJakarta()}.csv`}
                    headers={["Waktu (WIB)", "Aktor", "Modul", "Aksi", "Tipe Entitas", "ID Entitas", "Detail / Metadata"]}
                    rows={recentAuditLogs.map((log) => [
                      formatDateTime(log.createdAt),
                      log.actor ? `${log.actor.name} (${log.actor.email})` : "SYSTEM",
                      log.source ?? "system",
                      log.action,
                      log.entityType,
                      log.entityId ?? "",
                      log.metadata ? JSON.stringify(log.metadata) : "",
                    ])}
                  />
                }
                description="Catatan immutable semua mutasi sistem: perubahan status, posting persediaan, transaksi produksi, dan administrasi."
                title="Riwayat Jejak Audit (Audit Trail)"
              />
              <CardBody className="p-0">
                {recentAuditLogs.length === 0 ? (
                  <EmptyState icon={<History aria-hidden className="size-5" />} title="Belum ada catatan log audit" />
                ) : (
                  <Table>
                    <TableHead>
                      <Tr>
                        <Th>Waktu (WIB)</Th>
                        <Th>Aktor</Th>
                        <Th>Modul</Th>
                        <Th>Aksi</Th>
                        <Th>Entitas & ID</Th>
                        <Th>Detail / Metadata</Th>
                      </Tr>
                    </TableHead>
                    <TableBody>
                      {recentAuditLogs.map((log) => (
                        <Tr key={log.id}>
                          <Td className="tnum text-slate-600 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{formatDateTime(log.createdAt)}</div>
                            <div className="text-[11px] text-slate-400">{formatRelative(log.createdAt)}</div>
                          </Td>
                          <Td>
                            {log.actor ? (
                              <div>
                                <div className="font-medium text-slate-900">{log.actor.name}</div>
                                <div className="text-[12px] text-slate-400">{log.actor.email}</div>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[12px]">SYSTEM</span>
                            )}
                          </Td>
                          <Td>
                            <Badge tone="neutral">{log.source ?? "system"}</Badge>
                          </Td>
                          <Td>
                            <span className="font-mono text-[12px] font-semibold text-slate-800">{log.action}</span>
                          </Td>
                          <Td className="font-mono text-[12px] text-slate-600">
                            <span className="font-medium text-slate-900">{log.entityType}</span>
                            {log.entityId ? (
                              <span className="ml-1.5 text-slate-400" title={log.entityId}>
                                #{truncateId(log.entityId, 8)}
                              </span>
                            ) : null}
                          </Td>
                          <Td className="max-w-md font-mono text-[11px] text-slate-600 truncate">
                            {log.metadata ? JSON.stringify(log.metadata) : "—"}
                          </Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}
