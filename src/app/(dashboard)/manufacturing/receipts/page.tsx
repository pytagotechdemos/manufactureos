"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ReceiptsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formMoId, setFormMoId] = useState("");
  const [formInspectionId, setFormInspectionId] = useState("");
  const [formAcceptedQty, setFormAcceptedQty] = useState("");

  async function handlePostReceipt(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/v1/quality/production-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: "",
          manufacturingOrderId: formMoId,
          inspectionId: formInspectionId,
          warehouseId: "",
          acceptedQty: formAcceptedQty || "0",
          idempotencyKey: "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Gagal mencetak penerimaan produksi");
      setNotice("Barang jadi berhasil dipost.");
      (event.currentTarget as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencetak penerimaan produksi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Produksi"
        title="Terima Produksi"
        description="Posting inspeksi QC yang diterima ke stok barang jadi."
      />

      {error ? <Alert tone="danger" onClose={() => setError(null)}>{error}</Alert> : null}
      {notice ? <Alert tone="success" onClose={() => setNotice(null)}>{notice}</Alert> : null}

      <Card>
        <CardHeader title="Posting Terima Produksi" />
        <CardBody className="space-y-4">
          <form className="space-y-4" onSubmit={handlePostReceipt}>
            <Field label="Pesanan produksi" required>
              <Input name="manufacturingOrderId" placeholder="ID MO" required value={formMoId} onChange={(e) => setFormMoId(e.target.value)} />
            </Field>
            <Field label="ID inspeksi" required>
              <Input name="inspectionId" placeholder="ID inspeksi" required value={formInspectionId} onChange={(e) => setFormInspectionId(e.target.value)} />
            </Field>
            <Field label="Kuantitas diterima" required>
              <Input name="acceptedQty" type="number" step="0.000001" required value={formAcceptedQty} onChange={(e) => setFormAcceptedQty(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" loading={loading}>
              {loading ? "Memposting…" : "Posting terima produksi"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
