"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, Plus, Trash2 } from "lucide-react";

interface ItemOption {
  id: string;
  sku: string;
  name: string;
  baseUomId: string | null;
}

interface UomOption {
  id: string;
  code: string;
  name: string;
}

interface BomLineDraft {
  id: string;
  componentId: string;
  quantity: string;
  uomId: string;
  scrapRate: string;
}

const linkButtonClasses =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900";

export default function BomCreatePage() {
  const [bomNumber, setBomNumber] = useState("");
  const [revision, setRevision] = useState("1.0");
  const [outputItemId, setOutputItemId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("1");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [lines, setLines] = useState<BomLineDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  const loadMasterData = useCallback(async () => {
    setItemsLoading(true);
    try {
      const [itemRes, uomRes] = await Promise.all([
        fetch("/api/v1/items?limit=100", { headers: { Accept: "application/json" } }),
        fetch("/api/v1/uoms", { headers: { Accept: "application/json" } }),
      ]);
      if (!itemRes.ok || !uomRes.ok) throw new Error("Gagal memuat data master barang dan satuan");
      const [itemJson, uomJson] = await Promise.all([itemRes.json(), uomRes.json()]);
      const itemRows = (itemJson.data ?? []) as Array<{ id: string; sku: string; name: string; baseUomId: string | null }>;
      const uomRows = (uomJson.data ?? []) as Array<{ id: string; code: string; name: string }>;
      setItems(itemRows.map((i) => ({ id: i.id, sku: i.sku, name: i.name, baseUomId: i.baseUomId })));
      setUoms(uomRows.map((u) => ({ id: u.id, code: u.code, name: u.name })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data master");
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  const itemUnitById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of items) map.set(item.id, item.baseUomId);
    return map;
  }, [items]);

  async function handleCreateBom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/boms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: bomNumber,
          outputItemId,
          revision,
          outputQuantity,
          effectiveDate: effectiveDate || undefined,
          lines: lines.map((line) => ({
            componentItemId: line.componentId,
            quantity: line.quantity,
            uomId: line.uomId,
            scrapRate: line.scrapRate || "0",
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal membuat BOM");
      setNotice(`Draf BOM ${bomNumber} revisi ${revision} berhasil dibuat.`);
      setBomNumber("");
      setRevision("1.0");
      setOutputItemId("");
      setOutputQuantity("1");
      setEffectiveDate("");
      setLines([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat BOM");
    } finally {
      setLoading(false);
    }
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { id: crypto.randomUUID(), componentId: "", quantity: "1", uomId: "", scrapRate: "0" },
    ]);
  }

  function updateLine(id: string, patch: Partial<BomLineDraft>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));
  }

  const outputItem = items.find((item) => item.id === outputItemId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teknik"
        title="Buat BOM"
        description="Susun draf Bill of Materials: barang output, komponen, kuantitas, satuan, dan tingkat sisa."
        actions={
          <Link className={linkButtonClasses} href="/engineering">
            Eksplorasi BOM
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        }
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      {itemsLoading ? (
        <Card>
          <CardBody className="p-8 text-center text-slate-500">Memuat data master barang dan satuan…</CardBody>
        </Card>
      ) : (
        <form className="space-y-5" onSubmit={handleCreateBom}>
          <Card>
            <CardHeader
              title="Header BOM"
              description="Nomor dan revisi harus unik untuk setiap barang output."
            />
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Nomor BOM" required>
                  <Input
                    name="number"
                    placeholder="BOM-DESK-001"
                    required
                    value={bomNumber}
                    onChange={(event) => setBomNumber(event.target.value)}
                  />
                </Field>
                <Field label="Revisi" required>
                  <Input
                    name="revision"
                    placeholder="1.0"
                    required
                    value={revision}
                    onChange={(event) => setRevision(event.target.value)}
                  />
                </Field>
                <Field label="Tanggal efektif" hint="Kosongkan untuk berlaku langsung.">
                  <Input
                    name="effectiveDate"
                    type="date"
                    value={effectiveDate}
                    onChange={(event) => setEffectiveDate(event.target.value)}
                  />
                </Field>
                <Field label="Barang output" required>
                  <Select
                    name="outputItemId"
                    required
                    value={outputItemId}
                    onChange={(event) => setOutputItemId(event.target.value)}
                  >
                    <option value="">Pilih barang output</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Kuantitas output" required hint={outputItem ? `Menghasilkan ${outputItem.name}.` : undefined}>
                  <Input
                    name="outputQuantity"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    required
                    value={outputQuantity}
                    onChange={(event) => setOutputQuantity(event.target.value)}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Baris komponen"
              description="Pilih komponen, kuantitas pemakaian, satuan, dan perkiraan scrap."
              actions={
                <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                  <Plus aria-hidden className="size-4" />
                  Tambah baris
                </Button>
              }
            />
            <CardBody className="space-y-3">
              {lines.length === 0 ? (
                <EmptyState
                  compact
                  title="Belum ada komponen"
                  description="Tambahkan minimal satu baris komponen agar BOM dapat disimpan."
                  action={
                    <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                      <Plus aria-hidden className="size-4" />
                      Tambah baris pertama
                    </Button>
                  }
                />
              ) : (
                lines.map((line, index) => (
                  <div
                    key={line.id}
                    className="grid gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <Field label={`Komponen #${index + 1}`} required>
                      <Select
                        name={`component-${index}`}
                        required
                        value={line.componentId}
                        onChange={(event) =>
                          updateLine(line.id, {
                            componentId: event.target.value,
                            uomId: line.uomId || itemUnitById.get(event.target.value) || "",
                          })
                        }
                      >
                        <option value="">Pilih komponen</option>
                        {items
                          .filter((item) => item.id !== outputItemId)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.sku} · {item.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label="Kuantitas" required>
                      <Input
                        name={`quantity-${index}`}
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        required
                        value={line.quantity}
                        onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                      />
                    </Field>
                    <Field label="Satuan" required>
                      <Select
                        name={`uom-${index}`}
                        required
                        value={line.uomId}
                        onChange={(event) => updateLine(line.id, { uomId: event.target.value })}
                      >
                        <option value="">Pilih satuan</option>
                        {uoms.map((uom) => (
                          <option key={uom.id} value={uom.id}>
                            {uom.code} · {uom.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Scrap rate" hint="0 = tanpa scrap">
                      <Input
                        name={`scrap-${index}`}
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.scrapRate}
                        onChange={(event) => updateLine(line.id, { scrapRate: event.target.value })}
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Hapus komponen #${index + 1}`}
                        onClick={() => removeLine(line.id)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                        Hapus
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={loading} disabled={lines.length === 0}>
              {loading ? "Menyimpan…" : "Simpan draf BOM"}
            </Button>
            <p className="text-[13px] text-slate-500">
              Draf dapat diajukan untuk ditinjau lalu disetujui di halaman Eksplorasi BOM.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
