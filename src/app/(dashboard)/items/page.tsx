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
import { formatMoney, formatQuantity, todayJakarta } from "@/lib/format";
import { Download, Edit, History, Plus } from "lucide-react";
import { CreateCategoryModal } from "@/components/admin/create-category-modal";
import { ItemLifecycleModal } from "@/components/master-data/item-lifecycle-modal";
import { Pagination } from "@/components/ui/pagination";
import { downloadCsv } from "@/lib/csv";

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
  dimension?: string;
}

interface UomConversionRow {
  id: string;
  fromUomId: string;
  toUomId: string;
  factor: string;
  fromUom: { id: string; code: string; name: string; dimension: string };
  toUom: { id: string; code: string; name: string; dimension: string };
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

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "Bahan baku",
  PURCHASED_COMPONENT: "Komponen pembelian",
  SUB_ASSEMBLY: "Sub-assembly",
  FINISHED_GOODS: "Barang jadi",
  CONSUMABLE: "Konsumsi",
};

const supplyTypeLabels: Record<string, string> = {
  BUY: "Beli",
  MAKE: "Buat sendiri",
};

export default function ItemsPage() {
  const [activeTab, setActiveTab] = useState<"items" | "conversions">("items");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [conversions, setConversions] = useState<UomConversionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(25);

  useEffect(() => {
    setItemPage(1);
  }, [search]);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [lifecycleItem, setLifecycleItem] = useState<ItemRow | null>(null);

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

  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [convFromUomId, setConvFromUomId] = useState("");
  const [convToUomId, setConvToUomId] = useState("");
  const [convFactor, setConvFactor] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRes, catRes, uomRes, convRes] = await Promise.all([
        fetch("/api/v1/items?limit=100&offset=0"),
        fetch("/api/v1/categories"),
        fetch("/api/v1/uoms"),
        fetch("/api/v1/uom-conversions"),
      ]);
      if (!itemRes.ok || !catRes.ok || !uomRes.ok) throw new Error("Gagal memuat data master");
      const [itemJson, catJson, uomJson, convJson] = await Promise.all([
        itemRes.json(),
        catRes.json(),
        uomRes.json(),
        convRes.ok ? convRes.json() : Promise.resolve({ data: [] }),
      ]);
      const totalItems = Number(itemJson.page?.total ?? itemJson.data?.length ?? 0);
      const offsets = Array.from({ length: Math.max(0, Math.ceil(totalItems / 100) - 1) }, (_, index) => (index + 1) * 100);
      const pages: Array<{ data?: ItemRow[] }> = [];
      for (let index = 0; index < offsets.length; index += 10) {
        pages.push(...await Promise.all(offsets.slice(index, index + 10).map(async (offset) => {
          const response = await fetch(`/api/v1/items?limit=100&offset=${offset}`);
          if (!response.ok) throw new Error("Gagal memuat seluruh daftar barang");
          return response.json();
        })));
      }
      setItems([...(itemJson.data ?? []), ...pages.flatMap((page) => page.data ?? [])]);
      setCategories(catJson.data ?? []);
      setUoms(uomJson.data ?? []);
      setConversions(convJson.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data master");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("sku") || params.get("q");
      if (q) setSearch(q);
    }
  }, []);

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

  const paginatedItems = useMemo(() => {
    const start = (itemPage - 1) * itemPageSize;
    return filtered.slice(start, start + itemPageSize);
  }, [filtered, itemPage, itemPageSize]);

  function exportItemsCsv() {
    downloadCsv(
      `daftar-barang-${todayJakarta()}.csv`,
      [
        "SKU",
        "Nama Barang",
        "Kategori",
        "Tipe Barang",
        "Pengadaan",
        "Satuan Dasar",
        "Biaya Standar",
        "Lead Time (Hari)",
        "Reorder Point",
        "Safety Stock",
        "Min Order Qty",
        "Lot Size",
        "Status",
      ],
      filtered.map((item) => [
        item.sku,
        item.name,
        item.category?.name ?? "",
        itemTypeLabels[item.itemType] ?? item.itemType,
        supplyTypeLabels[item.supplyType] ?? item.supplyType,
        item.baseUom?.code ?? "",
        item.standardMaterialCost ?? "",
        item.purchasingLeadDays,
        item.reorderPoint ?? "",
        item.safetyStock ?? "",
        item.minimumOrderQty ?? "",
        item.lotSizeMultiple ?? "",
        item.status,
      ]),
    );
  }

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

  function openEdit(item: ItemRow) {
    setEditingItem(item);
    setFormSku(item.sku);
    setFormName(item.name);
    setFormDescription(item.description ?? "");
    setFormCategoryId(item.categoryId ?? "");
    setFormItemType(item.itemType);
    setFormSupplyType(item.supplyType);
    setFormBaseUomId(item.baseUomId ?? "");
    setFormStandardCost(item.standardMaterialCost ?? "");
    setFormReorderPoint(item.reorderPoint ?? "0");
    setFormSafetyStock(item.safetyStock ?? "0");
    setFormLeadDays(String(item.purchasingLeadDays ?? 0));
    setFormMinOrderQty(item.minimumOrderQty ?? "0");
    setFormLotSize(item.lotSizeMultiple ?? "0");
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

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim() || null,
          categoryId: formCategoryId,
          standardMaterialCost: formStandardCost.trim() || null,
          reorderPoint: formReorderPoint.trim(),
          safetyStock: formSafetyStock.trim(),
          purchasingLeadDays: Number.parseInt(formLeadDays, 10) || 0,
          minimumOrderQty: formMinOrderQty.trim(),
          lotSizeMultiple: formLotSize.trim(),
          status: formStatus,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memperbarui barang");
      setNotice(`Barang ${editingItem.sku} berhasil diperbarui.`);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui barang");
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

  async function handleCreateConversion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/uom-conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUomId: convFromUomId,
          toUomId: convToUomId,
          factor: convFactor.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menambahkan konversi satuan");
      setNotice("Konversi satuan berhasil ditambahkan.");
      setConversionModalOpen(false);
      setConvFromUomId("");
      setConvToUomId("");
      setConvFactor("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan konversi satuan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConversion(id: string) {
    if (!window.confirm("Apakah Anda yakin ingin menghapus konversi satuan ini?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/uom-conversions/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menghapus konversi satuan");
      setNotice("Konversi satuan berhasil dihapus.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus konversi satuan");
    } finally {
      setSaving(false);
    }
  }

  const selectedFromUom = uoms.find((u) => u.id === convFromUomId);
  const compatibleToUoms = uoms.filter(
    (u) => u.id !== convFromUomId && (!selectedFromUom?.dimension || u.dimension === selectedFromUom.dimension),
  );
  const selectedToUom = uoms.find((u) => u.id === convToUomId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data master"
        title="Data Master Barang & Satuan"
        description="Bahan baku, komponen pembelian, sub-assembly, barang jadi, serta rasio konversi satuan ukuran (UOM)."
        actions={
          activeTab === "items" ? (
            <div className="flex items-center gap-2">
              <CreateCategoryModal
                variant="secondary"
                buttonLabel="+ Kategori"
                onCreated={(cat) => {
                  setCategories((prev) => [...prev, cat].sort((a, b) => a.code.localeCompare(b.code)));
                  setNotice(`Kategori ${cat.code} (${cat.name}) berhasil ditambahkan.`);
                }}
              />
              <Button variant="primary" onClick={openCreate}>
                <Plus aria-hidden className="size-4" />
                Tambah barang
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={() => setConversionModalOpen(true)}>
              <Plus aria-hidden className="size-4" />
              Tambah konversi
            </Button>
          )
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <div className="flex border-b border-slate-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab("items")}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "items"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Data Barang ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("conversions")}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === "conversions"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Konversi Satuan ({conversions.length})
        </button>
      </div>

      {activeTab === "items" ? (
        <>
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
                <Field
                  label="Kategori"
                  required
                  hint={
                    <span className="inline-flex items-center gap-1 text-xs">
                      Tidak menemukan kategori?{" "}
                      <CreateCategoryModal
                        buttonLabel="+ Kategori Baru"
                        variant="ghost"
                        onCreated={(cat) => {
                          setCategories((prev) => [...prev, cat].sort((a, b) => a.code.localeCompare(b.code)));
                          setFormCategoryId(cat.id);
                        }}
                      />
                    </span>
                  }
                >
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
            title={`Ubah data barang: ${editingItem.sku}`}
            description={`Parameter biaya standar, lead time, lot sizing, dan status untuk ${editingItem.name}.`}
          />
          <CardBody>
            <form className="space-y-4" onSubmit={handleUpdate}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="SKU" hint="SKU tidak dapat diubah setelah dibuat.">
                  <Input name="sku" disabled value={editingItem.sku} />
                </Field>
                <Field label="Tipe barang" hint="Tipe barang terkunci.">
                  <Input name="itemType" disabled value={itemTypeLabels[editingItem.itemType] ?? editingItem.itemType} />
                </Field>
                <Field label="Satuan dasar" hint="Satuan dasar terkunci demi integritas ledger.">
                  <Input name="baseUom" disabled value={editingItem.baseUom?.code ?? "—"} />
                </Field>
                <Field label="Nama barang" required>
                  <Input
                    name="name"
                    required
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                  />
                </Field>
                <Field
                  label="Kategori"
                  required
                  hint={
                    <span className="inline-flex items-center gap-1 text-xs">
                      Tidak menemukan kategori?{" "}
                      <CreateCategoryModal
                        buttonLabel="+ Kategori Baru"
                        variant="ghost"
                        onCreated={(cat) => {
                          setCategories((prev) => [...prev, cat].sort((a, b) => a.code.localeCompare(b.code)));
                          setFormCategoryId(cat.id);
                        }}
                      />
                    </span>
                  }
                >
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
                <Field label="Biaya material standar" hint="Dalam Rupiah untuk estimasi costing BOM.">
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
                <Field label="Safety stock" hint="Kebutuhan minimum yang dijaga oleh MRP.">
                  <Input
                    name="safetyStock"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={formSafetyStock}
                    onChange={(event) => setFormSafetyStock(event.target.value)}
                  />
                </Field>
                <Field label="Lead time (hari)" hint="Waktu pengadaan atau produksi.">
                  <Input
                    name="purchasingLeadDays"
                    type="number"
                    min="0"
                    step="1"
                    value={formLeadDays}
                    onChange={(event) => setFormLeadDays(event.target.value)}
                  />
                </Field>
                <Field label="Minimum order qty" hint="MOQ untuk run MRP.">
                  <Input
                    name="minimumOrderQty"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={formMinOrderQty}
                    onChange={(event) => setFormMinOrderQty(event.target.value)}
                  />
                </Field>
                <Field label="Kelipatan lot size" hint="Lot sizing kelipatan batch pada MRP.">
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
                  {saving ? "Menyimpan…" : "Simpan perubahan"}
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
            <div className="flex items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Cari SKU, nama, kategori…" />
              <Button
                variant="secondary"
                size="sm"
                onClick={exportItemsCsv}
                disabled={filtered.length === 0}
                title="Unduh seluruh daftar barang sebagai file CSV"
              >
                <Download aria-hidden className="size-3.5" />
                Ekspor CSV
              </Button>
            </div>
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
            <>
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
                  {paginatedItems.map((item) => (
                    <Tr key={item.id}>
                      <Td className="tnum font-medium">{item.sku}</Td>
                      <Td className="text-slate-700">{item.name}</Td>
                      <Td className="text-slate-600">{item.category?.name ?? "—"}</Td>
                      <Td className="text-slate-600">{itemTypeLabels[item.itemType] ?? humanize(item.itemType)}</Td>
                      <Td className="text-slate-600">{supplyTypeLabels[item.supplyType] ?? humanize(item.supplyType)}</Td>
                      <Td align="right" className="tnum text-slate-600">
                        {item.baseUom?.code ?? "—"}
                      </Td>
                      <Td align="right" className="tnum text-slate-600">
                        {formatMoney(item.standardMaterialCost)}
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
                            aria-label={`Riwayat & Siklus Hidup ${item.sku}`}
                            title="Lihat riwayat siklus hidup & audit log barang"
                            onClick={() => setLifecycleItem(item)}
                          >
                            <History aria-hidden className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Edit ${item.sku}`}
                            title="Edit data barang"
                            onClick={() => openEdit(item)}
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
              <Pagination
                currentPage={itemPage}
                pageSize={itemPageSize}
                totalItems={filtered.length}
                onPageChange={setItemPage}
                onPageSizeChange={setItemPageSize}
              />
            </>
          )}
        </CardBody>
      </Card>
    </>
  ) : (
    <>
      {conversionModalOpen ? (
        <Card>
          <CardHeader
            title="Tambah Konversi Satuan"
            description="Definisikan faktor rasio konversi antara dua satuan dengan dimensi fisik yang sama (misal: COUNT, LENGTH, MASS)."
          />
          <CardBody>
            <form className="space-y-4" onSubmit={handleCreateConversion}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Satuan Asal (From)" required>
                  <Select
                    name="fromUomId"
                    required
                    value={convFromUomId}
                    onChange={(e) => {
                      setConvFromUomId(e.target.value);
                      setConvToUomId("");
                    }}
                  >
                    <option value="">Pilih satuan asal</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} — {u.name} ({u.dimension ?? "N/A"})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Satuan Tujuan (To)" required hint={selectedFromUom ? `Hanya satuan berdimensi ${selectedFromUom.dimension}` : "Pilih satuan asal terlebih dahulu"}>
                  <Select
                    name="toUomId"
                    required
                    disabled={!convFromUomId}
                    value={convToUomId}
                    onChange={(e) => setConvToUomId(e.target.value)}
                  >
                    <option value="">Pilih satuan tujuan</option>
                    {compatibleToUoms.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} — {u.name} ({u.dimension ?? "N/A"})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Faktor Pengali (Factor)" required hint="1 Satuan Asal = Factor × Satuan Tujuan">
                  <Input
                    name="factor"
                    type="number"
                    min="0.000000000001"
                    step="0.000001"
                    required
                    placeholder="contoh: 50 atau 1000"
                    value={convFactor}
                    onChange={(e) => setConvFactor(e.target.value)}
                  />
                </Field>
              </div>

              {selectedFromUom && selectedToUom && convFactor ? (
                <div className="rounded-md border border-brand-200 bg-brand-50/60 p-3 text-xs text-brand-900">
                  <strong>Pratinjau Hubungan:</strong> 1 {selectedFromUom.code} ({selectedFromUom.name}) = {convFactor} {selectedToUom.code} ({selectedToUom.name})
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="primary" loading={saving} disabled={!convFromUomId || !convToUomId || !convFactor}>
                  {saving ? "Menyimpan…" : "Simpan Konversi"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConversionModalOpen(false);
                    setConvFromUomId("");
                    setConvToUomId("");
                    setConvFactor("");
                  }}
                  disabled={saving}
                >
                  Batal
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Daftar Konversi Satuan (UOM Conversions)"
          description="Konversi yang dipakai mesin BOM explosion, inventori, dan pemenuhan kebutuhan pengadaan."
          actions={
            <Button variant="primary" onClick={() => setConversionModalOpen(true)}>
              <Plus aria-hidden className="size-4" />
              Tambah konversi
            </Button>
          }
        />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Memuat data konversi satuan…</div>
          ) : conversions.length === 0 ? (
            <EmptyState
              title="Belum ada konversi satuan"
              description="Definisikan konversi satuan antar unit ukuran (misalnya 1 Box = 50 Pcs)."
            />
          ) : (
            <Table>
              <TableHead>
                <Tr>
                  <Th>Satuan Asal</Th>
                  <Th>Satuan Tujuan</Th>
                  <Th>Dimensi</Th>
                  <Th align="right">Faktor Pengali</Th>
                  <Th align="right">Hubungan Konversi</Th>
                  <Th align="right">Aksi</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {conversions.map((conv) => (
                  <Tr key={conv.id}>
                    <Td className="font-semibold text-slate-900">
                      {conv.fromUom.code} <span className="font-normal text-slate-500">({conv.fromUom.name})</span>
                    </Td>
                    <Td className="font-semibold text-slate-900">
                      {conv.toUom.code} <span className="font-normal text-slate-500">({conv.toUom.name})</span>
                    </Td>
                    <Td className="text-slate-600">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {conv.fromUom.dimension}
                      </span>
                    </Td>
                    <Td align="right" className="tnum font-semibold text-brand-700">
                      {formatQuantity(conv.factor)}
                    </Td>
                    <Td align="right" className="tnum text-slate-600">
                      1 {conv.fromUom.code} = {formatQuantity(conv.factor)} {conv.toUom.code}
                    </Td>
                    <Td align="right">
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={saving}
                        onClick={() => void handleDeleteConversion(conv.id)}
                      >
                        Hapus
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  )}

  {lifecycleItem ? (
    <ItemLifecycleModal
      itemId={lifecycleItem.id}
      itemSku={lifecycleItem.sku}
      onClose={() => setLifecycleItem(null)}
    />
  ) : null}
</div>
  );
}
