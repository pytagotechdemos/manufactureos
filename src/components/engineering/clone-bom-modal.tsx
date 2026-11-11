"use client";

import { useState } from "react";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";

function suggestNextRevision(currentRev: string): string {
  const trimmed = currentRev.trim().toUpperCase();
  if (/^[A-Z]$/.test(trimmed)) {
    return String.fromCharCode(trimmed.charCodeAt(0) + 1);
  }
  const numeric = parseInt(trimmed, 10);
  if (!Number.isNaN(numeric)) {
    return String(numeric + 1).padStart(trimmed.length, "0");
  }
  return `${trimmed}-2`;
}

function suggestNextNumber(currentNumber: string, nextRev: string): string {
  // If the number ends with the revision, replace it
  const regex = /[-_]([A-Za-z0-9]+)$/;
  if (regex.test(currentNumber)) {
    return currentNumber.replace(regex, `-${nextRev}`);
  }
  return `${currentNumber}-${nextRev}`;
}

export function CloneBomModal({
  sourceBom,
  onCloned,
}: {
  sourceBom: {
    id: string;
    number: string;
    revision: string;
    outputItem: { sku: string; name: string };
    linesCount: number;
  };
  onCloned: (newBomId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const nextRev = suggestNextRevision(sourceBom.revision);
  const nextNum = suggestNextNumber(sourceBom.number, nextRev);

  const [number, setNumber] = useState(nextNum);
  const [revision, setRevision] = useState(nextRev);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    const rev = suggestNextRevision(sourceBom.revision);
    setRevision(rev);
    setNumber(suggestNextNumber(sourceBom.number, rev));
    setEffectiveDate("");
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/v1/boms/${sourceBom.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: number.trim(),
          revision: revision.trim(),
          effectiveDate: effectiveDate ? new Date(effectiveDate).toISOString() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Gagal membuat revisi BOM");
      }

      setOpen(false);
      onCloned(json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat revisi BOM");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={handleOpen}>
        <Copy aria-hidden className="size-4" />
        Buat Revisi Baru
      </Button>

      <Modal className="max-w-lg" label="Buat Revisi Baru dari BOM" onClose={handleClose} open={open}>
        <Card className="flex max-h-[90vh] flex-col shadow-2xl">
          <CardHeader
                actions={
                  <button
                    aria-label="Tutup form"
                    className="flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none"
                    onClick={handleClose}
                    type="button"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                }
                description="Salin struktur komponen dan rasio scrap dari BOM ini ke versi revisi baru (status draf)."
                title="Buat Revisi Baru dari BOM"
              />
              <CardBody className="space-y-4 overflow-y-auto">
                {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                  <div>
                    <span className="font-semibold text-slate-800">Item Output:</span>{" "}
                    {sourceBom.outputItem.sku} — {sourceBom.outputItem.name}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">BOM Sumber:</span>{" "}
                    {sourceBom.number} (Revisi {sourceBom.revision}) &middot; {sourceBom.linesCount} baris komponen
                  </div>
                </div>

                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field htmlFor="clone-bom-num" label="Nomor BOM baru" required>
                      <Input
                        id="clone-bom-num"
                        name="number"
                        onChange={(e) => setNumber(e.target.value)}
                        placeholder="Contoh: BOM-FG-001-B"
                        required
                        value={number}
                      />
                    </Field>
                    <Field htmlFor="clone-bom-rev" label="Revisi baru" required>
                      <Input
                        id="clone-bom-rev"
                        name="revision"
                        onChange={(e) => setRevision(e.target.value)}
                        placeholder="B, 02, dsb"
                        required
                        value={revision}
                      />
                    </Field>
                  </div>

                  <Field htmlFor="clone-bom-eff" label="Tanggal berlaku (opsional)">
                    <Input
                      id="clone-bom-eff"
                      name="effectiveDate"
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      type="date"
                      value={effectiveDate}
                    />
                  </Field>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button onClick={handleClose} type="button" variant="secondary">
                      Batal
                    </Button>
                    <Button
                      disabled={submitting || !number.trim() || !revision.trim()}
                      loading={submitting}
                      type="submit"
                      variant="primary"
                    >
                      <Copy aria-hidden className="size-4" />
                      Buat Revisi (Draf)
                    </Button>
                  </div>
                </form>
            </CardBody>
          </Card>
      </Modal>
    </>
  );
}
