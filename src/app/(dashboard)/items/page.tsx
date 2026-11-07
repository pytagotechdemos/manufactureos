"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Edit, Plus } from "lucide-react";

interface ItemRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  itemType: string;
  supplyType: string;
  baseUomId: string | null;
  standardMaterialCost: string | null;
  reorderPoint: string | null;
  safetyStock: string | null;
  purchasingLeadDays: number;
  minimumOrderQty: string | null;
  lotSizeMultiple: string | null;
  status: string;
  baseUom: { code: string; name: string } | null;
  category: { code: string; name: string } | null;
  createdAt: string;
}

interface CategoryOption {
  id: string;
  code: string;
  name: string;
}

interface UomOption {
  id: string;
  code: string;
  name: string;
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardBody className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="tnum text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-[12px] text-slate-500">{hint}</p>
      </CardBody>
    </Card>
  );
}

export default function ItemsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);

  const [formSku, setFormSku] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formItemType, setFormItemType] = useState("PURCHASED_COMPONENT");
  const [formSupplyType, setFormSupplyType] = useState("BUY");
  const [formBaseUomId, setFormBaseUomId] = useState("");
  const [formStandardCost, setFormStandardCost] = useState("");
  const [formReorderPoint, setFormReorderPoint] = useState("0");
  const [formSafetyStock, setFormSafetyStock] = useState("0");
  const [formLeadDays, setFormLeadDays] = useState("0");
  const [formMinOrderQty, setFormMinOrderQty] = useState("0");
  const [formLotSize, setFormLotSize] = useState("0");
  const [formStatus, setFormStatus] = useState("ACTIVE");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRes, catRes, uomRes] = await Promise.all([
        fetch("/api/v1/items?limit=100"),
        fetch("/api/v1/categories"),
        fetch("/api/v1/uoms"),
      ]);
      if (!itemRes.ok || !catRes.ok || !uomRes.ok) throw new Error("Gagal memuat data master");
      const [itemJson, catJson, uomJson] = await Promise.all([itemRes.json(), catRes.json(), uomRes.json()]);
      setItems(itemJson.data ?? []);
      setCategories(catJson.data ?? []);
      setUoms(uomJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data master");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.sku.toLowerCase().includes(needle) ||
        item.name.toLowerCase().includes(needle) ||
        (item.category?.name ?? "").toLowerCase().includes(needle),
    );
  }, [items, search]);

  const stats = useMemo(
    () => ({
      total: items.length,
      active: items.filter((item) => item.status === "ACTIVE").length,
      bought: items.filter((item) => item.supplyType === "BUY").length,
      made: items.filter((item) => item.supplyType === "MAKE").length,
    }),
    [items],
  );

  function resetForm() {
    setFormSku("");
    setFormName("");
    setFormDescription("");
    setFormCategoryId("");
    setFormItemType("PURCHASED_COMPONENT");
    setFormSupplyType("BUY");
    setFormBaseUomId("");
    setFormStandardCost("");
    setFormReorderPoint("0");
    setFormSafetyStock("0");
    setFormLeadDays("0");
    setFormMinOrderQty("0");
    setFormLotSize("0");
    setFormStatus("ACTIVE");
  }

  function openCreate() {
    resetForm();
    setEditingItem(null);
    setFormMode("create");
  }

  function openStatusEditor(item: ItemRow) {
    setEditingItem(item);
    setFormStatus(item.status);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingItem(null);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: formSku,
          name: formName,
          description: formDescription || undefined,
          categoryId: formCategoryId,
          itemType: formItemType,
          supplyType: formSupplyType,
          baseUomId: formBaseUomId,
          standardMaterialCost: formStandardCost || undefined,
          reorderPoint: formReorderPoint || "0",
          safetyStock: formSafetyStock || "0",
          purchasingLeadDays: Number.parseInt(formLeadDays, 10) || 0,
          minimumOrderQty: formMinOrderQty || "0",
          lotSizeMultiple: formLotSize || "0",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membuat barang");
      setNotice(`Barang ${formSku} berhasil dibuat.`);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat barang");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: formStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memperbarui status");
      setNotice(`Status ${editingItem.sku} diubah menjadi ${humanize(formStatus)}.`);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui status");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(item: ItemRow) {
    const nextStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setError(null);
    try {
      const res = await fetch(`/api/v1/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal mengubah status");
      setNotice(`Status ${item.sku} diubah menjadi ${humanize(nextStatus)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data master"
        title="Data Master Barang"
        description="Bahan baku, komponen pembelian, sub-assembly, dan barang jadi yang dipakai seluruh transaksi."
        actions={
          <Button variant="primary" onClick={openCreate}>
            <Plus aria-hidden className="size-4" />
            Tambah barang
          </Button>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total barang" value={stats.total} hint="Seluruh status" />
        <StatCard label="Aktif" value={stats.active} hint="Dapat dipakai transaksi" />
        <StatCard label="Dibeli" value={stats.bought} hint="Supply type BUY" />
        <StatCard label="Dibuat sendiri" value={stats.made} hint="Supply type MAKE" />
      </div>

      {formMode === "create" ? (
        <Card>
          <CardHeader
            title="Tambah barang"
            description="Field bertanda bintang wajib diisi. Kategori dan satuan harus berstatus aktif."
          />
          <CardBody>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="SKU" required>
                  <Input
                    name="sku"
                    placeholder="RM-STEEL-001"
                    required
                    value={formSku}
                    onChange={(event) => setFormSku(event.target.value)}
                  />
                </Field>
                <Field label="Nama barang" required>
                  <Input
                    name="name"
                    placeholder="Pelat baja 2 mm"
                    required
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                  />
                </Field>
                <Field label="Kategori" required>
                  <Select
                    name="categoryId"
                    required
                    value={formCategoryId}
                    onChange={(event) => setFormCategoryId(event.target.value)}
                  >
                    <option value="">Pilih kategori</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.code} — {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tipe barang" required>
                  <Select
                    name="itemType"
                    required
                    value={formItemType}
                    onChange={(event) => setFormItemType(event.target.value)}
                  >
                    <option value="RAW_MATERIAL">Bahan baku</option>
                    <option value="PURCHASED_COMPONENT">Komponen pembelian</option>
                    <option value="SUB_ASSEMBLY">Sub-assembly</option>
                    <option value="FINISHED_GOODS">Barang jadi</option>
                    <option value="CONSUMABLE">Konsumsi</option>
                  </Select>
                </Field>
                <Field label="Cara pengadaan" required>
                  <Select
                    name="supplyType"
                    required
                    value={formSupplyType}
                    onChange={(event) => setFormSupplyType(event.target.value)}
                  >
                    <option value="BUY">Beli</option>
                    <option value="MAKE">Buat sendiri</option>
                  </Select>
                </Field>
                <Field label="Satuan dasar" required>
                  <Select
                    name="baseUomId"
                    required
                    value={formBaseUomId}
                    onChange={(event) => setFormBaseUomId(event.target.value)}
                  >
                    <option value="">Pilih satuan</option>
                    {uoms.map((uom) => (
                      <option key={uom.id} value={uom.id}>
                        {uom.code} — {uom.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Biaya material standar" hint="Opsional, dalam Rupiah.">
                  <Input
                    name="standardMaterialCost"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={formStandardCost}
                    onChange={(event) => setFormStandardCost(event.target.value)}
                  />
                </Field>
                <Field label="Titik pemesanan ulang">
                  <Input
                    name="reorderPoint"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={formReorderPoint}
                    onChange={(event) => setFormReorderPoint(event.target.value)}
                  />
                </Field>
                <Field label="Safety stock">
                  <Input
                    name="safetyStock"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={formSafetyStock}
                    onChange={(event) => setFormSafetyStock(event.target.value)}
                  />
                </Field>
                <Field label="Lead time (hari)">
                  <Input
                    name="purchasingLeadDays"
                    type="number"
                    min="0"
                    step="1"
                    value={formLeadDays}
                    onChange={(event) => setFormLeadDays(event.target.value)}
                  />
                </Field>
                <Field label="Minimum order qty">
                  <Input
                    name="minimumOrderQty"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={formMinOrderQty}
                    onChange={(event) => setFormMinOrderQty(event.target.value)}
                  />
                </Field>
                <Field label="Kelipatan lot size">
                  <Input
                    name="lotSizeMultiple"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={formLotSize}
                    onChange={(event) => setFormLotSize(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Deskripsi" className="max-w-2xl">
                <Input
                  name="description"
                  placeholder="Spesifikasi singkat, grade material, atau catatan teknis."
                  value={formDescription}
                  onChange={(event) => setFormDescription(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" loading={saving}>
                  {saving ? "Menyimpan…" : "Simpan barang"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
                  Batal
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {formMode === "edit" && editingItem ? (
        <Card>
          <CardHeader
            title={`Ubah status ${editingItem.sku}`}
            description={`${editingItem.name} · status saat ini ${humanize(editingItem.status)}.`}
          />
          <CardBody>
            <form className="max-w-md space-y-4" onSubmit={handleUpdateStatus}>
              <Field label="Status" required>
                <Select
                  name="status"
                  required
                  value={formStatus}
                  onChange={(event) => setFormStatus(event.target.value)}
                >
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Tidak aktif</option>
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" loading={saving}>
                  {saving ? "Menyimpan…" : "Simpan status"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>
                  Batal
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Daftar barang"
          description={`${filtered.length} dari ${items.length} barang ditampilkan.`}
          actions={
            <SearchInput value={search} onChange={setSearch} placeholder="Cari SKU, nama, kategori…" />
          }
        />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Memuat data barang…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Belum ada barang yang cocok"
              description="Ubah kata kunci pencarian atau tambahkan barang baru."
            />
          ) : (
            <Table>
              <TableHead>
                <Tr>
                  <Th>SKU</Th>
                  <Th>Nama</Th>
                  <Th>Kategori</Th>
                  <Th>Tipe</Th>
                  <Th>Pengadaan</Th>
                  <Th align="right">Satuan</Th>
                  <Th align="right">Biaya std.</Th>
                  <Th align="right">Lead time</Th>
                  <Th>Status</Th>
                  <Th align="right">Aksi</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {filtered.map((item) => (
                  <Tr key={item.id}>
                    <Td className="tnum font-medium">{item.sku}</Td>
                    <Td className="text-slate-700">{item.name}</Td>
                    <Td className="text-slate-600">{item.category?.name ?? "—"}</Td>
                    <Td className="text-slate-600">{humanize(item.itemType)}</Td>
                    <Td className="text-slate-600">{humanize(item.supplyType)}</Td>
                    <Td align="right" className="tnum text-slate-600">
                      {item.baseUom?.code ?? "—"}
                    </Td>
                    <Td align="right" className="tnum text-slate-600">
                      {item.standardMaterialCost ?? "—"}
                    </Td>
                    <Td align="right" className="tnum text-slate-600">
                      {item.purchasingLeadDays} hari
                    </Td>
                    <Td>
                      <StatusBadge status={item.status} />
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Ubah status ${item.sku}`}
                          title="Ubah status"
                          onClick={() => openStatusEditor(item)}
                        >
                          <Edit aria-hidden className="size-4" />
                        </Button>
                        <Button
                          variant={item.status === "ACTIVE" ? "danger" : "secondary"}
                          size="sm"
                          onClick={() => handleToggleStatus(item)}
                        >
                          {item.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                      </div>
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
