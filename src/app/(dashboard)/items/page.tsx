"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput, Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2 } from "lucide-react";

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
  baseUom: { code: string } | null;
  createdAt: string;
}

interface Category {
  id: string;
  code: string;
  name: string;
}

interface Uom {
  id: string;
  code: string;
  name: string;
}

type ItemFormMode = "create" | "edit";

export default function ItemsPage() {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formMode, setFormMode] = useState<ItemFormMode | null>(null);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);

  const [formSku, setFormSku] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formItemType, setFormItemType] = useState("PURCHASED_COMPONENT");
  const [formSupplyType, setFormSupplyType] = useState("BUY");
  const [formBaseUomId, setFormBaseUomId] = useState("");
  const [formStandardCost, setFormStandardCost] = useState("");
  const [formReorderPoint, setFormReorderPoint] = useState("");
  const [formSafetyStock, setFormSafetyStock] = useState("");
  const [formLeadDays, setFormLeadDays] = useState("0");
  const [formMinOrderQty, setFormMinOrderQty] = useState("");
  const [formLotSize, setFormLotSize] = useState("");
  const [formStatus, setFormStatus] = useState("ACTIVE");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRes, catRes, uomRes] = await Promise.all([
        fetch("/api/v1/items?limit=200"),
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

  const filtered = items.filter(
    (item) =>
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()),
  );

  const itemTypeLabel = (v: string) => {
    const m: Record<string, string> = {
      RAW_MATERIAL: "Bahan Baku",
      PURCHASED_COMPONENT: "Komponen Pembelian",
      SUB_ASSEMBLY: "Sub-Assembly",
      FINISHED_GOODS: "Barang Jadi",
      CONSUMABLE: "Konsumsi",
    };
    return m[v] ?? v;
  };

  const supplyTypeLabel = (v: string) => (v === "MAKE" ? "Buat Sendiri" : "Beli");

  const openCreate = () => {
    setFormMode("create");
    setEditingItem(null);
    setFormSku("");
    setFormName("");
    setFormDescription("");
    setFormCategoryId("");
    setFormItemType("PURCHASED_COMPONENT");
    setFormSupplyType("BUY");
    setFormBaseUomId("");
    setFormStandardCost("");
    setFormReorderPoint("");
    setFormSafetyStock("");
    setFormLeadDays("0");
    setFormMinOrderQty("");
    setFormLotSize("");
    setFormStatus("ACTIVE");
  };

  const openEdit = (item: ItemRow) => {
    setFormMode("edit");
    setEditingItem(item);
    setFormSku(item.sku);
    setFormName(item.name);
    setFormDescription(item.description ?? "");
    setFormCategoryId(item.categoryId ?? "");
    setFormItemType(item.itemType);
    setFormSupplyType(item.supplyType);
    setFormBaseUomId(item.baseUomId ?? "");
    setFormStandardCost(item.standardMaterialCost ?? "");
    setFormReorderPoint(item.reorderPoint ?? "");
    setFormSafetyStock(item.safetyStock ?? "");
    setFormLeadDays(String(item.purchasingLeadDays));
    setFormMinOrderQty(item.minimumOrderQty ?? "");
    setFormLotSize(item.lotSizeMultiple ?? "");
    setFormStatus(item.status);
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingItem(null);
  };

  async function handleSaveItem(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const body = {
      sku: formSku,
      name: formName,
      description: formDescription || undefined,
      categoryId: formCategoryId || undefined,
      itemType: formItemType,
      supplyType: formSupplyType,
      baseUomId: formBaseUomId || undefined,
      standardMaterialCost: formStandardCost || undefined,
      reorderPoint: formReorderPoint || undefined,
      safetyStock: formSafetyStock || undefined,
      purchasingLeadDays: parseInt(formLeadDays, 10) || 0,
      minimumOrderQty: formMinOrderQty || undefined,
      lotSizeMultiple: formLotSize || undefined,
      status: formStatus,
    };

    try {
      const res = formMode === "create"
        ? await fetch("/api/v1/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch(`/api/v1/items/${editingItem!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: formStatus }) });
      if (!res.ok) throw new Error("Gagal menyimpan barang");
      setNotice(formMode === "create" ? "Barang berhasil dibuat." : "Barang berhasil diperbarui.");
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan barang");
    }
  }

  async function handleDeleteItem(id: string, sku: string) {
    if (!confirm(`Hapus barang ${sku}?`)) return;
    try {
      const res = await fetch(`/api/v1/items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus barang");
      setNotice("Barang berhasil dihapus.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus barang");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data master"
        title="Data Master Barang"
        description="Bahan baku, komponen pembelian, sub-assembly dan barang jadi."
        actions={
          <div className="flex items-end gap-2">
            <Button onClick={openCreate} variant="primary">
              <Plus aria-hidden className="size-4 mr-2" /> Tambah barang
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      {formMode ? (
        <Card>
          <CardHeader
            title={formMode === "create" ? "Tambah Barang" : "Edit Barang"}
            description={formMode === "create" ? "Buat data master barang baru." : "Ubah data barang yang ada."}
          />
          <CardBody className="space-y-4">
            <form className="space-y-4" onSubmit={handleSaveItem}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SKU" required>
                  <Input name="sku" required value={formSku} onChange={(e) => setFormSku(e.target.value)} />
                </Field>
                <Field label="Nama Barang" required>
                  <Input name="name" required value={formName} onChange={(e) => setFormName(e.target.value)} />
                </Field>
                <Field label="Deskripsi">
                  <Input name="description" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
                </Field>
                <Field label="Kategori" required>
                  <Select name="categoryId" required value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)}>
                    <option value="">Pilih kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Tipe Barang" required>
                  <Select name="itemType" required value={formItemType} onChange={(e) => setFormItemType(e.target.value)}>
                    <option value="RAW_MATERIAL">Bahan Baku</option>
                    <option value="PURCHASED_COMPONENT">Komponen Pembelian</option>
                    <option value="SUB_ASSEMBLY">Sub-Assembly</option>
                    <option value="FINISHED_GOODS">Barang Jadi</option>
                    <option value="CONSUMABLE">Konsumsi</option>
                  </Select>
                </Field>
                <Field label="Tipe Persediaan" required>
                  <Select name="supplyType" required value={formSupplyType} onChange={(e) => setFormSupplyType(e.target.value)}>
                    <option value="BUY">Beli</option>
                    <option value="MAKE">Buat Sendiri</option>
                  </Select>
                </Field>
                <Field label="Satuan Dasar" required>
                  <Select name="baseUomId" required value={formBaseUomId} onChange={(e) => setFormBaseUomId(e.target.value)}>
                    <option value="">Pilih satuan</option>
                    {uoms.map((u) => (
                      <option key={u.id} value={u.id}>{u.code} — {u.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Biaya Material Standar">
                  <Input name="standardCost" type="number" step="0.0001" value={formStandardCost} onChange={(e) => setFormStandardCost(e.target.value)} />
                </Field>
                <Field label="Titik Pemesanan Ulang">
                  <Input name="reorderPoint" type="number" step="0.000001" value={formReorderPoint} onChange={(e) => setFormReorderPoint(e.target.value)} />
                </Field>
                <Field label="Safety Stock">
                  <Input name="safetyStock" type="number" step="0.000001" value={formSafetyStock} onChange={(e) => setFormSafetyStock(e.target.value)} />
                </Field>
                <Field label="Lead Time (hari)">
                  <Input name="leadDays" type="number" value={formLeadDays} onChange={(e) => setFormLeadDays(e.target.value)} />
                </Field>
                <Field label="Min Order Qty">
                  <Input name="minOrderQty" type="number" step="0.000001" value={formMinOrderQty} onChange={(e) => setFormMinOrderQty(e.target.value)} />
                </Field>
                <Field label="Lot Size Multiple">
                  <Input name="lotSize" type="number" step="0.000001" value={formLotSize} onChange={(e) => setFormLotSize(e.target.value)} />
                </Field>
                <Field label="Status" required>
                  <Select name="status" required value={formStatus} onChange={(e) => setFormStatus(e.target.value)}>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Tidak Aktif</option>
                  </Select>
                </Field>
              </div>
              <div className="flex gap-3">
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? "Menyimpan…" : "Simpan Barang"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeForm}>
                  Batal
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex items-end gap-2 p-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Cari barang…" />
      </div>

      <Card>
        <CardHeader
          description={`${filtered.length} barang${filtered.length === 1 ? "" : "s"} dalam data master.`}
          title="Daftar Barang"
        />
        <CardBody className="p-0">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Memuat…</div>
          ) : filtered.length === 0 ? (
            <EmptyState title="Tidak ada barang yang cocok dengan pencarian" />
          ) : (
            <Table>
              <TableHead>
                <Tr>
                  <Th>SKU</Th>
                  <Th>Nama</Th>
                  <Th>Tipe</Th>
                  <Th>Persediaan</Th>
                  <Th align="right">Satuan</Th>
                  <Th align="right">Biaya Std.</Th>
                  <Th>Status</Th>
                  <Th align="right">Aksi</Th>
                </Tr>
              </TableHead>
              <TableBody>
                {filtered.map((item) => (
                  <Tr key={item.id}>
                    <Td className="font-medium tnum">{item.sku}</Td>
                    <Td className="text-slate-600">{item.name}</Td>
                    <Td className="text-slate-600">{itemTypeLabel(item.itemType)}</Td>
                    <Td className="text-slate-600">{supplyTypeLabel(item.supplyType)}</Td>
                    <Td align="right" className="tnum text-slate-600">{item.baseUom?.code ?? "—"}</Td>
                    <Td align="right" className="tnum text-slate-600">{item.standardMaterialCost ?? "—"}</Td>
                    <Td>{<StatusBadge status={item.status} />}</Td>
                    <Td align="right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="mr-2">
                        <Edit aria-hidden className="size-4" />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteItem(item.id, item.sku)}>
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
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
