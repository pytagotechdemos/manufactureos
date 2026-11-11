"use client";

import { useEffect, useState } from "react";
import { Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

interface BomDetail {
  id: string;
  number: string;
  revision: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "OBSOLETE";
  outputQty: string;
  effectiveDate: string | null;
  outputItem: { id: string; sku: string; name: string; baseUom: { code: string } };
  lines: Array<{
    id: string;
    quantity: string;
    scrapRate: string;
    sequence: number;
    notes: string | null;
    component: { id: string; sku: string; name: string; supplyType: "MAKE" | "BUY"; baseUom: { code: string } };
    uom: { id: string; code: string; name: string };
  }>;
}

interface EditBomDraftModalProps {
  detail: BomDetail;
  onSaved: () => Promise<void>;
}

export function EditBomDraftModal({ detail, onSaved }: EditBomDraftModalProps) {
  const [open, setOpen] = useState(false);
  const [outputQuantity, setOutputQuantity] = useState(detail.outputQty);
  const [effectiveDate, setEffectiveDate] = useState(detail.effectiveDate ? detail.effectiveDate.slice(0, 10) : "");
  const [lines, setLines] = useState(
    detail.lines.map((l) => ({
      componentItemId: l.component.id,
      sku: l.component.sku,
      name: l.component.name,
      quantity: l.quantity,
      uomId: l.uom.id,
      uomCode: l.uom.code,
      scrapRate: l.scrapRate,
      notes: l.notes ?? "",
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOutputQuantity(detail.outputQty);
    setEffectiveDate(detail.effectiveDate ? detail.effectiveDate.slice(0, 10) : "");
    setLines(
      detail.lines.map((l) => ({
        componentItemId: l.component.id,
        sku: l.component.sku,
        name: l.component.name,
        quantity: l.quantity,
        uomId: l.uom.id,
        uomCode: l.uom.code,
        scrapRate: l.scrapRate,
        notes: l.notes ?? "",
      })),
    );
  }, [detail]);

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        number: detail.number,
        outputItemId: detail.outputItem.id,
        revision: detail.revision,
        outputQuantity,
        effectiveDate: effectiveDate || undefined,
        lines: lines.map((line) => ({
          componentItemId: line.componentItemId,
          quantity: line.quantity,
          uomId: line.uomId,
          scrapRate: line.scrapRate || "0",
          notes: line.notes || undefined,
        })),
      };
      const res = await fetch(`/api/v1/boms/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal menyimpan perubahan draf BOM");
      await onSaved();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan draf BOM");
    } finally {
      setSaving(false);
    }
  }

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Edit2 aria-hidden className="size-4" />
        Edit Draf
      </Button>

      <Modal className="max-w-2xl" label="Edit Draf BOM" onClose={handleClose} open={open}>
        <Card className="max-h-[90vh] overflow-y-auto border-0 shadow-none">
              <CardHeader
                title="Edit Draf BOM"
                description={`Ubah parameter draf untuk ${detail.number} Revisi ${detail.revision}`}
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Tutup modal"
                    onClick={handleClose}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                }
              />
              <CardBody className="space-y-4">
                {error ? <Alert tone="danger">{error}</Alert> : null}

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Kuantitas output" required hint={`Satuan: ${detail.outputItem.baseUom.code}`}>
                      <Input
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        required
                        value={outputQuantity}
                        onChange={(e) => setOutputQuantity(e.target.value)}
                      />
                    </Field>
                    <Field label="Tanggal efektif" hint="Kosongkan jika langsung berlaku.">
                      <Input
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <h4 className="text-sm font-semibold text-slate-800">Komponen Draf</h4>
                    <p className="text-xs text-slate-500">Sesuaikan kuantitas dan scrap rate setiap komponen.</p>
                    <div className="mt-3 space-y-3">
                      {lines.map((line, idx) => (
                        <div key={line.componentItemId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-medium text-slate-800 text-xs">
                              {line.sku} · {line.name}
                            </span>
                            <span className="text-xs text-slate-500">Satuan: {line.uomCode}</span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Kuantitas" required>
                              <Input
                                type="number"
                                min="0.000001"
                                step="0.000001"
                                required
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                              />
                            </Field>
                            <Field label="Scrap rate" hint="0 = tanpa scrap, maks 0.9999 (99.99%)">
                              <Input
                                type="number"
                                min="0"
                                max="0.9999"
                                step="0.0001"
                                value={line.scrapRate}
                                onChange={(e) => updateLine(idx, { scrapRate: e.target.value })}
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button type="button" variant="secondary" onClick={handleClose}>
                      Batal
                    </Button>
                    <Button type="submit" variant="primary" loading={saving}>
                      {saving ? "Menyimpan…" : "Simpan Perubahan"}
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
      </Modal>
    </>
  );
}
