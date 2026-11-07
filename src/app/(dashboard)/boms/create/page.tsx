"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function BomCreatePage() {
  const [bomNumber, setBomNumber] = useState("");
  const [revision, setRevision] = useState("1.0");
  const [outputItemId, setOutputItemId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [lines, setLines] = useState<{ id: string; componentId: string; quantity: string; uomId: string; scrapRate: string; sequence: number; notes: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const availableItems = [
    { id: "1", sku: "RM-001", name: "Papan Jati" },
    { id: "2", sku: "PC-001", name: "Sanket Baja" },
    { id: "3", sku: "PC-002", name: "Paku Kayu" },
    { id: "4", sku: "SA-001", name: "Lemari Meja" },
    { id: "5", sku: "FG-001", name: "Meja Kantor Kayu" },
  ];

  async function handleCreateBom(event: React.FormEvent) {
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
            scrapRate: line.scrapRate,
            notes: line.notes,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal membuat BOM");
      setNotice(`BOM ${bomNumber} berhasil dibuat.`);
      setBomNumber("");
      setRevision("1.0");
      setOutputItemId("");
      setOutputQuantity("");
      setEffectiveDate("");
      setLines([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat BOM");
    } finally {
      setLoading(false);
    }
  }

  const addLine = () => {
    setLines([...lines, {
      id: crypto.randomUUID(),
      componentId: "",
      quantity: "",
      uomId: "",
      scrapRate: "0",
      sequence: lines.length + 1,
      notes: "",
    }]);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Teknik"
        title="Buat BOM"
        description="Buat draf Bill of Materials baru. Tentukan barang output, komponen, kuantitas dan tingkat sisa."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Card>
        <CardHeader title="Header BOM" />
        <CardBody className="space-y-4">
          <form className="space-y-4" onSubmit={handleCreateBom}>
            <Field label="Nomor BOM" required>
              <Input name="number" placeholder="BOM-DESK-001" required value={bomNumber} onChange={(e) => setBomNumber(e.target.value)} />
            </Field>
            <Field label="Revisi" required>
              <Input name="revision" placeholder="1.0" required value={revision} onChange={(e) => setRevision(e.target.value)} />
            </Field>
            <Field label="Barang output (SKU)" required>
              <Select name="outputItemId" required value={outputItemId} onChange={(e) => setOutputItemId(e.target.value)}>
                <option value="">Pilih barang output</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kuantitas output" required>
              <Input name="outputQuantity" type="number" step="0.000001" required value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} />
            </Field>
            <Field label="Tanggal efektif">
              <Input name="effectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </Field>

            <h3 className="text-sm font-semibold text-slate-900 mt-4 mb-2">Baris BOM (Komponen)</h3>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={line.id} className="flex gap-3">
                  <Field label="Komponen" required>
                    <Select name={`component-${index}`} required value={line.componentId} onChange={(e) => {
                      const newLines = [...lines];
                      newLines[index].componentId = e.target.value;
                      setLines(newLines);
                    }}>
                      <option value="">Pilih komponen</option>
                      {availableItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Kuantitas" required>
                    <Input name={`qty-${index}`} type="number" step="0.000001" required value={line.quantity} onChange={(e) => {
                      const newLines = [...lines];
                      newLines[index].quantity = e.target.value;
                      setLines(newLines);
                    }} />
                  </Field>
                  <Field label="Satuan" required>
                    <Select name={`uom-${index}`} required value={line.uomId} onChange={(e) => {
                      const newLines = [...lines];
                      newLines[index].uomId = e.target.value;
                      setLines(newLines);
                    }}>
                      <option value="">Pilih satuan</option>
                    </Select>
                  </Field>
                  <Field label="Tingkat sisa" required>
                    <Input name={`scrap-${index}`} type="number" step="0.0001" required value={line.scrapRate} onChange={(e) => {
                      const newLines = [...lines];
                      newLines[index].scrapRate = e.target.value;
                      setLines(newLines);
                    }} />
                  </Field>
                  <Button type="button" variant="danger" onClick={() => setLines(lines.filter((_, i) => i !== index))} size="sm">
                    Hapus
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                + Tambah baris komponen
              </Button>
            </div>

            <Button type="submit" variant="primary" loading={loading}>
              {loading ? "Membuat…" : "Buat draf BOM"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Langkah selanjutnya" />
        <CardBody className="space-y-3">
          <p className="text-[13px] text-slate-600">Setelah membuat draf BOM, Anda dapat:</p>
          <ul className="list-disc list-inside space-y-1 text-[13px] text-slate-600">
            <li>Mengajukan BOM untuk ditinjau</li>
            <li>Menyetujui BOM (membuatnya tidak dapat diubah)</li>
            <li>Melihat esplosi BOM (kebutuhan komponen multi-level)</li>
            <li>Menggunakan BOM dalam run MRP dan pesanan produksi</li>
          </ul>
          <Button variant="secondary">Lihat Eksplorasi BOM</Button>
        </CardBody>
      </Card>
    </div>
  );
}
